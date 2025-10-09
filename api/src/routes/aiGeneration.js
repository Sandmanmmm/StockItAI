/**
 * AI Generation Routes
 * Handles OpenAI-powered product description and title generation
 */

import express from 'express'
import OpenAI from 'openai'
import { db } from '../lib/db.js'

const router = express.Router()

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

/**
 * Helper function to remove pack/case quantities from product names
 * Removes patterns like: "Case of 12", "Pack of 6", "12-Pack", "24ct", etc.
 */
function removePackQuantities(productName) {
  if (!productName) return productName
  
  // Remove leading pack/case quantities: "Case of 12 - Product", "Pack of 6 Product"
  let cleaned = productName.replace(/^(case|pack|box)\s+of\s+\d+\s*[-:•]\s*/i, '')
  
  // Remove trailing pack/case quantities: "Product - Pack of 12", "Product (Case of 6)"
  cleaned = cleaned.replace(/\s*[-:•(]\s*(case|pack|box)\s+of\s+\d+\s*[)]?$/i, '')
  
  // Remove embedded pack quantities: "12-Pack Product", "Product 24ct", "6 Count"
  cleaned = cleaned.replace(/\b\d+\s*[-\s]*(pack|case|box|ct|count)\b/gi, '')
  
  // Remove standalone quantity indicators at the end: "Product 12", "Product x6"
  cleaned = cleaned.replace(/\s+x?\d+\s*$/i, '')
  
  // Clean up any double spaces or leading/trailing dashes
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/^\s*[-:•]\s*|\s*[-:•]\s*$/g, '').trim()
  
  return cleaned
}

/**
 * POST /api/ai-generation/product-content
 * Generate AI-enhanced product title and description
 */
router.post('/product-content', async (req, res) => {
  try {
    const {
      productName,
      originalDescription,
      sku,
      category,
      price,
      supplier,
      lineItemId
    } = req.body

    if (!productName) {
      return res.status(400).json({
        success: false,
        error: 'Product name is required'
      })
    }

    console.log('🤖 Generating AI content for:', productName)
    
    // Clean the product name by removing pack/case quantities
    const cleanedProductName = removePackQuantities(productName)
    console.log('📝 Cleaned product name:', cleanedProductName, '(original:', productName, ')')

    // Build context for OpenAI using CLEANED product name
    const contextParts = [
      `Product Name: ${cleanedProductName}`,
      originalDescription && `Original Description: ${originalDescription}`,
      sku && `SKU: ${sku}`,
      category && `Category: ${category}`,
      price && `Price: $${price}`,
      supplier && `Supplier: ${supplier}`
    ].filter(Boolean)

    const context = contextParts.join('\n')

    // Generate refined title
    const titlePrompt = `You are a professional e-commerce product copywriter. Given the following product information, create a concise, compelling, and SEO-optimized product title (maximum 70 characters).

${context}

CRITICAL REQUIREMENTS:
- Keep it under 70 characters
- Make it clear and descriptive
- Include key features or benefits if space allows
- Make it compelling for online shoppers
- Do NOT include prices, just the product name and key features
- ABSOLUTELY FORBIDDEN: Do NOT include ANY pack/case/bulk quantities like "Case of 12", "Pack of 6", "12-Pack", "24ct", "Bulk", "Wholesale", etc.
- This is for INDIVIDUAL RETAIL product sales to end consumers, NOT wholesale or B2B
- Customers purchase ONE SINGLE item, not cases, packs, or bulk quantities
- Focus ONLY on describing the individual product itself
- Treat this as if it were being sold in a retail store where customers buy one at a time
- If the original name mentions quantities, IGNORE THEM COMPLETELY

Generate only the title, no explanations:`

    const titleCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert e-commerce copywriter specializing in product titles.'
        },
        {
          role: 'user',
          content: titlePrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 100
    })

    const refinedTitle = titleCompletion.choices[0].message.content.trim()

    // Generate refined description
    const descriptionPrompt = `You are a professional e-commerce product copywriter. Given the following product information, create a compelling, informative, and SEO-optimized product description.

${context}

CRITICAL REQUIREMENTS:
- Write 2-3 short paragraphs (150-250 words total)
- Focus on benefits, not just features
- Use persuasive, customer-focused language
- Include key features and specifications
- Make it scannable with clear benefits
- Write in a professional but friendly tone
- Do NOT include prices or promotional offers
- ABSOLUTELY FORBIDDEN: Do NOT mention ANY pack/case/bulk quantities like "Case of 12", "Pack of 6", "sold in packs", "comes in cases", "bulk", "wholesale", etc.
- This is for INDIVIDUAL RETAIL product sales to end consumers, NOT wholesale or B2B
- Describe ONLY the SINGLE INDIVIDUAL product that a customer will receive when they order ONE unit
- Customers purchase and receive ONE item, not cases or packs
- Write as if this were being sold in a retail store where customers buy one at a time
- Do NOT reference bulk packaging, wholesale quantities, multi-pack configurations, or case sizes
- If the original information mentions quantities, COMPLETELY IGNORE THEM
- Focus exclusively on the product's individual features, benefits, quality, and use cases

Generate only the description, no explanations:`

    const descriptionCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert e-commerce copywriter specializing in product descriptions that convert.'
        },
        {
          role: 'user',
          content: descriptionPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 400
    })

    const refinedDescription = descriptionCompletion.choices[0].message.content.trim()

    console.log('✅ Generated title:', refinedTitle)
    console.log('✅ Generated description length:', refinedDescription.length, 'characters')

    // If lineItemId provided, update the product draft
    if (lineItemId) {
      try {
        const prisma = await db.getClient()
        const draft = await prisma.productDraft.findFirst({
          where: { lineItemId }
        })

        if (draft) {
          await prisma.productDraft.update({
            where: { id: draft.id },
            data: {
              refinedTitle,
              refinedDescription,
              updatedAt: new Date()
            }
          })
          console.log('✅ Updated product draft with AI content')
        }
      } catch (dbError) {
        console.error('⚠️  Failed to update product draft:', dbError)
        // Don't fail the request if DB update fails
      }
    }

    res.json({
      success: true,
      data: {
        refinedTitle,
        refinedDescription,
        originalTitle: productName,
        originalDescription
      }
    })

  } catch (error) {
    console.error('❌ AI generation error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate AI content'
    })
  }
})

/**
 * POST /api/ai-generation/product-tags
 * Generate AI-enhanced product tags and category suggestions
 */
router.post('/product-tags', async (req, res) => {
  try {
    const {
      productName,
      description,
      sku,
      category,
      price,
      supplier,
      lineItemId
    } = req.body

    if (!productName) {
      return res.status(400).json({
        success: false,
        error: 'Product name is required'
      })
    }

    console.log('🏷️  Generating AI tags for:', productName)

    // Build context for OpenAI
    const contextParts = [
      `Product Name: ${productName}`,
      description && `Description: ${description}`,
      sku && `SKU: ${sku}`,
      category && `Current Category: ${category}`,
      price && `Price: $${price}`,
      supplier && `Supplier: ${supplier}`
    ].filter(Boolean)

    const context = contextParts.join('\n')

    // Generate tags and category
    const prompt = `You are an e-commerce product categorization expert. Given the following product information, generate:
1. A suggested product type (a specific product category like "Electronics", "Apparel", "Home Goods", "Sports Equipment", etc.)
2. A suggested Shopify vendor/brand name (if identifiable from supplier or product name)
3. 5-10 relevant product tags (single words or short phrases, separated by commas)

${context}

Requirements for tags:
- Include material/composition if identifiable
- Include use cases or occasions
- Include style/aesthetic descriptors
- Include target audience if clear
- Include features or benefits
- Make them searchable and SEO-friendly
- Use lowercase
- No hashtags or special characters

Format your response as JSON:
{
  "productType": "specific product type here",
  "vendor": "suggested vendor/brand name or supplier name",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert in e-commerce product categorization and tagging. Always respond in valid JSON format.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 250
    })

    const generated = JSON.parse(completion.choices[0].message.content)

    console.log('✅ Generated product type:', generated.productType)
    console.log('✅ Generated vendor:', generated.vendor)
    console.log('✅ Generated tags:', generated.tags)

    // If lineItemId provided, update the product draft
    if (lineItemId) {
      try {
        const prisma = await db.getClient()
        const draft = await prisma.productDraft.findFirst({
          where: { lineItemId }
        })

        if (draft) {
          await prisma.productDraft.update({
            where: { id: draft.id },
            data: {
              productType: generated.productType,
              vendor: generated.vendor || supplier,
              tags: generated.tags,
              updatedAt: new Date()
            }
          })
          console.log('✅ Updated product draft with AI tags and product type')
        }
      } catch (dbError) {
        console.error('⚠️  Failed to update product draft:', dbError)
        // Don't fail the request if DB update fails
      }
    }

    res.json({
      success: true,
      data: {
        productType: generated.productType,
        vendor: generated.vendor || supplier,
        tags: generated.tags
      }
    })

  } catch (error) {
    console.error('❌ AI tags generation error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate AI tags'
    })
  }
})

/**
 * POST /api/ai-generation/bulk-product-content
 * Generate AI content for multiple products
 */
router.post('/bulk-product-content', async (req, res) => {
  try {
    const { products } = req.body

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Products array is required'
      })
    }

    console.log(`🤖 Generating AI content for ${products.length} products`)

  const results = []
  const errors = []
  let prisma

    for (const product of products) {
      try {
        // Clean the product name by removing pack/case quantities
        const cleanedProductName = removePackQuantities(product.productName)
        console.log('📝 Bulk: Cleaned product name:', cleanedProductName, '(original:', product.productName, ')')
        
        // Make individual request for each product
        const contextParts = [
          `Product Name: ${cleanedProductName}`,
          product.originalDescription && `Original Description: ${product.originalDescription}`,
          product.sku && `SKU: ${product.sku}`,
          product.category && `Category: ${product.category}`,
          product.price && `Price: $${product.price}`,
          product.supplier && `Supplier: ${product.supplier}`
        ].filter(Boolean)

        const context = contextParts.join('\n')

        // Generate both title and description in one call
        const prompt = `You are a professional e-commerce product copywriter. Given the following product information, create:
1. A refined product title (max 70 characters)
2. A compelling product description (150-250 words)

${context}

CRITICAL REQUIREMENTS:
- Do NOT include pack/case quantities like "Case of 12", "Pack of 6", "12-Pack", "24ct", etc.
- This is for INDIVIDUAL product sales, not wholesale/bulk descriptions
- Customers buy individual items, not cases or packs
- Focus on the single product, not packaging or bulk quantities

Format your response as JSON:
{
  "title": "your refined title here",
  "description": "your compelling description here"
}`

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert e-commerce copywriter. Always respond in valid JSON format.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
          max_tokens: 500
        })

        const generated = JSON.parse(completion.choices[0].message.content)

        results.push({
          lineItemId: product.lineItemId,
          productName: product.productName,
          refinedTitle: generated.title,
          refinedDescription: generated.description,
          success: true
        })

        // Update product draft if lineItemId provided
        if (product.lineItemId) {
          try {
            if (!prisma) {
              prisma = await db.getClient()
            }
            const draft = await prisma.productDraft.findFirst({
              where: { lineItemId: product.lineItemId }
            })

            if (draft) {
              await prisma.productDraft.update({
                where: { id: draft.id },
                data: {
                  refinedTitle: generated.title,
                  refinedDescription: generated.description,
                  updatedAt: new Date()
                }
              })
            }
          } catch (dbError) {
            console.error('⚠️  Failed to update draft for', product.productName, dbError)
          }
        }

      } catch (productError) {
        console.error(`❌ Failed to generate for ${product.productName}:`, productError)
        errors.push({
          lineItemId: product.lineItemId,
          productName: product.productName,
          error: productError.message,
          success: false
        })
      }
    }

    console.log(`✅ Generated content for ${results.length}/${products.length} products`)

    res.json({
      success: true,
      data: {
        results,
        errors,
        summary: {
          total: products.length,
          successful: results.length,
          failed: errors.length
        }
      }
    })

  } catch (error) {
    console.error('❌ Bulk AI generation error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate bulk AI content'
    })
  }
})

export default router
