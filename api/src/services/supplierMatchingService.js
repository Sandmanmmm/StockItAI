/**
 * Supplier Matching Service
 * Implements fuzzy matching algorithm to find and suggest suppliers
 * based on various data points from AI-parsed purchase orders.
 * 
 * HYBRID IMPLEMENTATION:
 * - Supports both JavaScript (Levenshtein) and PostgreSQL (pg_trgm) engines
 * - Routes based on feature flags with automatic fallback
 * - JavaScript: Proven, slower (67s for 100 suppliers)
 * - pg_trgm: New, faster (<100ms for 100 suppliers)
 */

import { db } from '../lib/db.js'
import { featureFlags } from '../config/featureFlags.js'
import { findMatchingSuppliersViaPgTrgm } from './supplierMatchingServicePgTrgm.js'
import { logPerformanceMetric } from '../lib/performanceMonitoring.js'

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Distance score
 */
function levenshteinDistance(a, b) {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0)
  
  const matrix = []
  
  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  
  // Calculate distances
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }
  
  return matrix[b.length][a.length]
}

/**
 * Calculate similarity score between two strings (0-1)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score (0-1, 1 being identical)
 */
function stringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0
  
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()
  
  // Exact match
  if (s1 === s2) return 1.0
  
  // One contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length)
    const maxLen = Math.max(s1.length, s2.length)
    return 0.7 + (0.3 * (minLen / maxLen))
  }
  
  // Levenshtein-based similarity
  const maxLen = Math.max(s1.length, s2.length)
  const distance = levenshteinDistance(s1, s2)
  const similarity = 1 - (distance / maxLen)
  
  return Math.max(0, similarity)
}

/**
 * Normalize company name for better matching
 * Removes common business suffixes and special characters
 * @param {string} name - Company name
 * @returns {string} - Normalized name
 */
function normalizeCompanyName(name) {
  if (!name) return ''
  
  let normalized = name.toLowerCase().trim()
  
  // Remove common business suffixes
  const suffixes = [
    'inc', 'incorporated', 'corp', 'corporation', 'llc', 'ltd',
    'limited', 'co', 'company', 'enterprises', 'group', 'holdings'
  ]
  
  for (const suffix of suffixes) {
    // Remove suffix at end with optional punctuation
    normalized = normalized.replace(new RegExp(`[,.]?\\s*${suffix}\\.?$`, 'i'), '')
  }
  
  // Remove special characters but keep spaces
  normalized = normalized.replace(/[^a-z0-9\s]/g, '')
  
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim()
  
  return normalized
}

/**
 * Extract domain from email or URL
 * @param {string} emailOrUrl - Email address or URL
 * @returns {string|null} - Domain or null
 */
function extractDomain(emailOrUrl) {
  if (!emailOrUrl) return null
  
  try {
    // Email format
    if (emailOrUrl.includes('@')) {
      return emailOrUrl.split('@')[1].toLowerCase()
    }
    
    // URL format
    const url = new URL(emailOrUrl.startsWith('http') ? emailOrUrl : `https://${emailOrUrl}`)
    return url.hostname.toLowerCase().replace('www.', '')
  } catch {
    return null
  }
}

/**
 * Calculate match score between parsed supplier data and existing supplier
 * @param {Object} parsedSupplier - Supplier data from AI parsing
 * @param {Object} existingSupplier - Existing supplier from database
 * @returns {Object} - Match score and breakdown
 */
function calculateMatchScore(parsedSupplier, existingSupplier) {
  const scores = {
    name: 0,
    email: 0,
    phone: 0,
    address: 0,
    website: 0
  }
  
  const weights = {
    name: 0.40,      // Name is most important
    email: 0.25,     // Email domain is strong indicator
    website: 0.20,   // Website domain is strong indicator
    phone: 0.10,     // Phone is good but can change
    address: 0.05    // Address is least reliable
  }
  
  // Name matching (with normalization)
  if (parsedSupplier.name && existingSupplier.name) {
    const normalizedParsed = normalizeCompanyName(parsedSupplier.name)
    const normalizedExisting = normalizeCompanyName(existingSupplier.name)
    scores.name = stringSimilarity(normalizedParsed, normalizedExisting)
  }
  
  // Email domain matching
  if (parsedSupplier.email && existingSupplier.contactEmail) {
    const parsedDomain = extractDomain(parsedSupplier.email)
    const existingDomain = extractDomain(existingSupplier.contactEmail)
    
    if (parsedDomain && existingDomain) {
      scores.email = parsedDomain === existingDomain ? 1.0 : 0.0
    }
  }
  
  // Website domain matching
  if (parsedSupplier.website && existingSupplier.website) {
    const parsedDomain = extractDomain(parsedSupplier.website)
    const existingDomain = extractDomain(existingSupplier.website)
    
    if (parsedDomain && existingDomain) {
      scores.website = parsedDomain === existingDomain ? 1.0 : 0.0
    }
  }
  
  // Phone matching (normalized)
  if (parsedSupplier.phone && existingSupplier.contactPhone) {
    const normalizedParsed = parsedSupplier.phone.replace(/\D/g, '')
    const normalizedExisting = existingSupplier.contactPhone.replace(/\D/g, '')
    
    if (normalizedParsed && normalizedExisting) {
      // Check last 10 digits (ignore country code differences)
      const parsedLast10 = normalizedParsed.slice(-10)
      const existingLast10 = normalizedExisting.slice(-10)
      scores.phone = parsedLast10 === existingLast10 ? 1.0 : 0.0
    }
  }
  
  // Address matching (fuzzy)
  if (parsedSupplier.address && existingSupplier.address) {
    scores.address = stringSimilarity(parsedSupplier.address, existingSupplier.address)
  }
  
  // Calculate weighted total score
  let totalScore = 0
  let totalWeight = 0
  
  for (const [key, score] of Object.entries(scores)) {
    if (score > 0) { // Only include fields that had data to compare
      totalScore += score * weights[key]
      totalWeight += weights[key]
    }
  }
  
  // Normalize score based on available data
  const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0
  
  return {
    score: Math.round(finalScore * 100) / 100, // Round to 2 decimals
    confidence: totalWeight >= 0.5 ? 'high' : totalWeight >= 0.25 ? 'medium' : 'low',
    breakdown: scores,
    weights,
    availableFields: Object.keys(scores).filter(key => scores[key] > 0)
  }
}

/**
 * Find matching suppliers for parsed supplier data (JAVASCRIPT IMPLEMENTATION)
 * Uses Levenshtein distance algorithm - slower but proven reliable
 * 
 * @param {Object} parsedSupplier - Supplier data from AI parsing
 * @param {string} merchantId - Merchant ID to search within
 * @param {Object} options - Matching options
 * @returns {Promise<Array>} - Array of matched suppliers with scores
 */
async function findMatchingSuppliersViaJavaScript(parsedSupplier, merchantId, options = {}) {
  const {
    minScore = 0.7,        // Minimum score threshold (0-1)
    maxResults = 5,        // Maximum number of results
    includeInactive = false // Include inactive suppliers
  } = options
  
  console.log('🔍 [JavaScript Engine] Finding matching suppliers for:', {
    name: parsedSupplier.name,
    email: parsedSupplier.email,
    phone: parsedSupplier.phone,
    website: parsedSupplier.website,
    address: parsedSupplier.address,
    merchantId,
    options
  })
  
  const startTime = Date.now()
  
  try {
    const client = await db.getClient()
    // Get all suppliers for merchant
    const suppliers = await client.supplier.findMany({
      where: {
        merchantId,
        ...(includeInactive ? {} : { status: 'active' })
      },
      include: {
        _count: {
          select: { purchaseOrders: true }
        }
      }
    })
    
    console.log(`📊 [JavaScript] Found ${suppliers.length} suppliers to compare against`)
    
    // Calculate match scores for all suppliers
    const matches = suppliers.map(supplier => {
      const matchResult = calculateMatchScore(parsedSupplier, supplier)
      
      return {
        supplier: {
          id: supplier.id,
          name: supplier.name,
          contactEmail: supplier.contactEmail,
          contactPhone: supplier.contactPhone,
          address: supplier.address,
          website: supplier.website,
          status: supplier.status,
          totalPOs: supplier._count.purchaseOrders,
          createdAt: supplier.createdAt
        },
        matchScore: matchResult.score,
        confidence: matchResult.confidence,
        breakdown: matchResult.breakdown,
        availableFields: matchResult.availableFields,
        metadata: {
          engine: 'javascript',
          executionTime: Date.now() - startTime
        }
      }
    })
    
    // Filter by minimum score and sort by score descending
    const filteredMatches = matches
      .filter(match => match.matchScore >= minScore)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, maxResults)
    
    const elapsedTime = Date.now() - startTime
    console.log(`✅ [JavaScript] Found ${filteredMatches.length} matches above threshold ${minScore} in ${elapsedTime}ms`)
    
    return filteredMatches
    
  } catch (error) {
    console.error('❌ [JavaScript] Error finding matching suppliers:', error)
    throw new Error(`Failed to find matching suppliers: ${error.message}`)
  }
}

/**
 * Find matching suppliers for parsed supplier data (HYBRID ROUTER)
 * Routes to appropriate engine based on feature flags
 * Automatically falls back to JavaScript on error
 * 
 * @param {Object} parsedSupplier - Supplier data from AI parsing
 * @param {string} merchantId - Merchant ID to search within
 * @param {Object} options - Matching options
 * @returns {Promise<Array>} - Array of matched suppliers with scores
 */
export async function findMatchingSuppliers(parsedSupplier, merchantId, options = {}) {
  const startTime = Date.now()
  
  // Check which engine to use via feature flags
  const usePgTrgm = await featureFlags.usePgTrgmMatching(
    merchantId,
    options.engine  // Optional override for testing
  )
  
  const engineName = usePgTrgm ? 'pg_trgm' : 'javascript'
  console.log(`🚦 [Hybrid Router] Using ${engineName} engine for supplier matching`)
  
  try {
    let results
    
    if (usePgTrgm) {
      // Try pg_trgm engine (fast, PostgreSQL-based)
      try {
        results = await findMatchingSuppliersViaPgTrgm(
          parsedSupplier,
          merchantId,
          options
        )
        
        const elapsedTime = Date.now() - startTime
        console.log(`✅ [pg_trgm] Completed in ${elapsedTime}ms`)
        
        // Log performance metric to database
        await logPerformanceMetric({
          merchantId,
          engine: 'pg_trgm',
          operation: 'findMatchingSuppliers',
          durationMs: elapsedTime,
          resultCount: results.length,
          success: true,
          metadata: {
            minScore: options.minScore,
            maxResults: options.maxResults,
            supplierName: parsedSupplier.name
          }
        })
        
        return results
        
      } catch (pgTrgmError) {
        // Automatic fallback to JavaScript on error
        console.error('❌ [pg_trgm] Error, falling back to JavaScript:', pgTrgmError.message)
        
        // Log failure to database
        await logPerformanceMetric({
          merchantId,
          engine: 'pg_trgm',
          operation: 'findMatchingSuppliers',
          durationMs: Date.now() - startTime,
          resultCount: 0,
          success: false,
          error: pgTrgmError.message,
          metadata: {
            minScore: options.minScore,
            maxResults: options.maxResults,
            supplierName: parsedSupplier.name
          }
        })
        
        // Fall through to JavaScript implementation
      }
    }
    
    // Use JavaScript engine (proven fallback)
    results = await findMatchingSuppliersViaJavaScript(
      parsedSupplier,
      merchantId,
      options
    )
    
    const elapsedTime = Date.now() - startTime
    
    // Log performance metric to database
    await logPerformanceMetric({
      merchantId,
      engine: 'javascript',
      operation: 'findMatchingSuppliers',
      durationMs: elapsedTime,
      resultCount: results.length,
      success: true,
      metadata: {
        minScore: options.minScore,
        maxResults: options.maxResults,
        supplierName: parsedSupplier.name,
        wasFallback: usePgTrgm // Indicates this was a fallback
      }
    })
    
    return results
    
  } catch (error) {
    console.error('❌ [Hybrid Router] Error in supplier matching:', error)
    
    // Log failure to database
    await logPerformanceMetric({
      merchantId,
      engine: engineName,
      operation: 'findMatchingSuppliers',
      durationMs: Date.now() - startTime,
      resultCount: 0,
      success: false,
      error: error.message,
      metadata: {
        minScore: options.minScore,
        maxResults: options.maxResults,
        supplierName: parsedSupplier.name
      }
    })
    
    throw new Error(`Failed to find matching suppliers: ${error.message}`)
  }
}

/**
 * Get best matching supplier (convenience function)
 * @param {Object} parsedSupplier - Supplier data from AI parsing
 * @param {string} merchantId - Merchant ID
 * @param {number} minScore - Minimum score threshold (default 0.8)
 * @returns {Promise<Object|null>} - Best match or null
 */
export async function getBestMatch(parsedSupplier, merchantId, minScore = 0.8) {
  const matches = await findMatchingSuppliers(parsedSupplier, merchantId, {
    minScore,
    maxResults: 1
  })
  
  return matches.length > 0 ? matches[0] : null
}

/**
 * Auto-match and link supplier to purchase order
 * @param {string} purchaseOrderId - Purchase order ID
 * @param {Object} parsedSupplier - Parsed supplier data
 * @param {string} merchantId - Merchant ID
 * @param {Object} options - Matching options
 * @returns {Promise<Object>} - Match result with supplier link
 */
export async function autoMatchSupplier(purchaseOrderId, parsedSupplier, merchantId, options = {}) {
  const {
    autoLink = true,           // Automatically link high-confidence matches
    minAutoLinkScore = 0.85,   // Minimum score for auto-linking
    createIfNoMatch = false    // Create new supplier if no match found
  } = options
  
  console.log('🤖 Auto-matching supplier for PO:', purchaseOrderId)
  
  try {
    const client = await db.getClient()
    // Find matches
    const matches = await findMatchingSuppliers(parsedSupplier, merchantId, {
      minScore: 0.6, // Lower threshold for suggestions
      maxResults: 5
    })
    
    let linkedSupplier = null
    let action = 'no_match'
    
    if (matches.length > 0) {
      const bestMatch = matches[0]
      
      // Auto-link if score is high enough
      if (autoLink && bestMatch.matchScore >= minAutoLinkScore) {
        console.log(`✅ High confidence match (${bestMatch.matchScore}), auto-linking supplier: ${bestMatch.supplier.name}`)
        
        // Link supplier to purchase order
        await client.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: {
            supplierId: bestMatch.supplier.id,
            supplierName: bestMatch.supplier.name
          }
        })
        
        linkedSupplier = bestMatch.supplier
        action = 'auto_linked'
      } else {
        console.log(`📋 Match found but score too low for auto-link (${bestMatch.matchScore})`)
        action = 'suggestions_available'
      }
    } else if (createIfNoMatch && parsedSupplier.name) {
      console.log('🆕 No match found, creating new supplier')
      
      // Create new supplier
      const newSupplier = await client.supplier.create({
        data: {
          name: parsedSupplier.name,
          contactEmail: parsedSupplier.email || null,
          contactPhone: parsedSupplier.phone || null,
          address: parsedSupplier.address || null,
          website: parsedSupplier.website || null,
          merchantId,
          status: 'active',
          connectionType: 'manual'
        }
      })
      
      // Link to purchase order
      await client.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: {
          supplierId: newSupplier.id,
          supplierName: newSupplier.name
        }
      })
      
      linkedSupplier = newSupplier
      action = 'created_and_linked'
    }
    
    return {
      success: true,
      action,
      linkedSupplier,
      matches,
      suggestionsCount: matches.length
    }
    
  } catch (error) {
    console.error('❌ Error in auto-match supplier:', error)
    throw new Error(`Failed to auto-match supplier: ${error.message}`)
  }
}

/**
 * Suggest suppliers for manual selection
 * @param {Object} parsedSupplier - Parsed supplier data
 * @param {string} merchantId - Merchant ID
 * @returns {Promise<Object>} - Suggestions with match details
 */
export async function suggestSuppliers(parsedSupplier, merchantId) {
  console.log('💡 Suggesting suppliers for:', parsedSupplier.name)
  
  try {
    const matches = await findMatchingSuppliers(parsedSupplier, merchantId, {
      minScore: 0.5, // Lower threshold for suggestions
      maxResults: 10
    })
    
    // Categorize matches by confidence
    const suggestions = {
      highConfidence: matches.filter(m => m.matchScore >= 0.85),
      mediumConfidence: matches.filter(m => m.matchScore >= 0.7 && m.matchScore < 0.85),
      lowConfidence: matches.filter(m => m.matchScore < 0.7),
      total: matches.length
    }
    
    return {
      success: true,
      parsedSupplier,
      suggestions,
      recommendAction: suggestions.highConfidence.length > 0 ? 'auto_link' : 
                       suggestions.mediumConfidence.length > 0 ? 'manual_select' : 
                       'create_new'
    }
    
  } catch (error) {
    console.error('❌ Error suggesting suppliers:', error)
    throw new Error(`Failed to suggest suppliers: ${error.message}`)
  }
}

export default {
  findMatchingSuppliers,
  findMatchingSuppliersViaJavaScript,  // Export for testing
  getBestMatch,
  autoMatchSupplier,
  suggestSuppliers,
  // Export utility functions for testing
  stringSimilarity,
  normalizeCompanyName,
  extractDomain,
  calculateMatchScore
}
