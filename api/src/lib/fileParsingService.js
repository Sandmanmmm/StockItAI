/**
 * File Processing Service
 * Handles parsing of PDF, Excel, CSV, and image files to extract PO data
 * Updated: Fixed PDF.js worker configuration for serverless
 */

import * as XLSX from 'xlsx'
import csv from 'csv-parser'
import sharp from 'sharp'
import { Readable } from 'stream'

export class FileParsingService {
  /**
   * Parse uploaded file based on its type
   */
  async parseFile(buffer, mimeType, fileName, options = {}) {
    const { progressHelper } = options
    
    try {
      console.log(`Starting file parsing for ${fileName} (${mimeType})`)
      
      switch (mimeType) {
        case 'application/pdf':
          return await this.parsePDF(buffer, progressHelper)
        
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        case 'application/vnd.ms-excel':
          return await this.parseExcel(buffer)
        
        case 'text/csv':
          return await this.parseCSV(buffer)
        
        case 'image/jpeg':
        case 'image/png':
        case 'image/jpg':
          return await this.parseImage(buffer)
        
        default:
          throw new Error(`Unsupported file type: ${mimeType}`)
      }
    } catch (error) {
      console.error(`File parsing error for ${fileName}:`, error)
      throw new Error(`Failed to parse file: ${error.message}`)
    }
  }

  /**
   * Parse PDF files and extract text content using pdf2json
   * Serverless-friendly PDF parser that works in Lambda/Vercel environments
   * @param {Buffer} buffer - PDF file buffer
   * @param {ProgressHelper} progressHelper - Progress tracker (optional)
   */
  async parsePDF(buffer, progressHelper = null) {
    try {
      // Use pdf2json which is serverless-compatible
      const PDFParser = (await import('pdf2json')).default
      
      return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser()
        
        pdfParser.on('pdfParser_dataError', (errData) => {
          console.error('PDF parsing error:', errData.parserError)
          reject(new Error(`PDF parsing failed: ${errData.parserError}`))
        })
        
        pdfParser.on('pdfParser_dataReady', async (pdfData) => {
          try {
            // Extract text from all pages with progress tracking
            const pages = pdfData.Pages || []
            const totalPages = pages.length
            
            // DEBUG: Log page structure to diagnose missing content
            if (process.env.DEBUG_PDF_STRUCTURE === 'true') {
              console.log(`[DEBUG PDF] Total pages: ${totalPages}`)
              pages.forEach((page, idx) => {
                const textCount = page.Texts?.length || 0
                const fillCount = page.Fills?.length || 0
                console.log(`[DEBUG PDF] Page ${idx + 1}: ${textCount} text elements, ${fillCount} fills`)
                if (idx < 2) { // Log first 2 pages in detail
                  console.log(`[DEBUG PDF] Page ${idx + 1} Texts sample:`, page.Texts?.slice(0, 5).map(t => ({
                    x: t.x,
                    y: t.y,
                    runs: t.R?.length,
                    text: t.R?.map(r => decodeURIComponent(r.T || '')).join(' ')
                  })))
                }
              })
            }
            
            // PDF parsing is 0-20% of AI Parsing stage (which is 0-40% of total)
            // So local 0-100% within parsePDF → 0-20% of AI stage → 0-8% global
            
            const pageTexts = []
            
            for (let i = 0; i < pages.length; i++) {
              const page = pages[i]
              const texts = page.Texts || []
              
              // ENHANCED: Sort text elements by Y position (top to bottom), then X (left to right)
              // This ensures table rows are read in correct order
              const sortedTexts = texts.slice().sort((a, b) => {
                // Sort by Y first (rows), with small tolerance for same-line text
                const yDiff = Math.abs(a.y - b.y)
                if (yDiff > 0.1) {
                  return a.y - b.y // Top to bottom
                }
                // Same line: sort by X (left to right)
                return a.x - b.x
              })
              
              // Extract text with position-aware spacing
              let currentY = -1
              const textParts = []
              let skippedCount = 0
              let processedCount = 0
              
              sortedTexts.forEach((text, idx) => {
                const runs = text.R || []
                const textContent = runs.map(run => {
                  const decoded = decodeURIComponent(run.T || '')
                  // Keep the text even if it's just whitespace if it has actual characters
                  return decoded
                }).join(' ').trim()
                
                // Skip only completely empty text (but keep single characters, numbers, etc.)
                if (!textContent || textContent.length === 0) {
                  skippedCount++
                  return
                }
                
                processedCount++
                
                // Add newline if we moved to a new row (Y position changed significantly)
                if (currentY >= 0 && Math.abs(text.y - currentY) > 0.1) {
                  textParts.push('\n')
                } else if (textParts.length > 0) {
                  // Same line: add space between text elements
                  textParts.push(' ')
                }
                
                textParts.push(textContent)
                currentY = text.y
              })
              
              const pageText = textParts.join('')
              
              if (process.env.DEBUG_PDF_STRUCTURE === 'true' && i < 2) {
                console.log(`[DEBUG PDF] Page ${i + 1}: processed ${processedCount} / ${texts.length} text elements (skipped ${skippedCount} empty)`)
                console.log(`[DEBUG PDF] Page ${i + 1} text length: ${pageText.length} chars`)
                console.log(`[DEBUG PDF] Page ${i + 1} text preview (first 500 chars):`, pageText.substring(0, Math.min(500, pageText.length)))
              }
              
              pageTexts.push(pageText)
              
              // Publish progress for each page (0-20% of AI stage, 0-8% global)
              if (progressHelper) {
                const pageProgress = ((i + 1) / totalPages) * 100
                await progressHelper.publishSubStageProgress(
                  pageProgress,
                  0, // Sub-stage starts at 0% of AI stage
                  20, // Sub-stage occupies 0-20% of AI stage
                  `Parsing page ${i + 1}/${totalPages}`,
                  { currentPage: i + 1, totalPages }
                )
              }
            }
            
            let fullText = pageTexts.join('\n\n')
            
            // Apply intelligent character spacing normalization if detected
            const spacingAnalysis = this._analyzeCharacterSpacing(fullText)
            if (spacingAnalysis.hasArtificialSpacing) {
              if (process.env.DEBUG_PDF_STRUCTURE) {
                console.log(`[DEBUG PDF] Detected artificial spacing (${(spacingAnalysis.ratio * 100).toFixed(1)}%), applying normalization`)
              }
              fullText = this._normalizeDocumentSpacing(fullText, spacingAnalysis)
            }
            
            const result = {
              text: fullText.trim(),
              pages: pages.length,
              pageTexts,
              metadata: {
                numPages: pages.length,
                extractedAt: new Date().toISOString(),
                spacingNormalized: spacingAnalysis.hasArtificialSpacing
              },
              rawContent: fullText.trim(),
              confidence: 0.9,
              extractionMethod: 'pdf2json-v3'
            }
            
            console.log(`PDF parsed successfully: ${result.pages} pages, ${result.text.length} characters`)
            
            // Publish completion of PDF parsing (20% of AI stage, 8% global)
            if (progressHelper) {
              await progressHelper.publishSubStageProgress(
                100,
                0,
                20,
                `Extracted ${result.text.length} characters from ${result.pages} pages`,
                { 
                  pages: result.pages, 
                  characters: result.text.length,
                  confidence: result.confidence
                }
              )
            }
            
            resolve(result)
          } catch (error) {
            reject(new Error(`PDF text extraction failed: ${error.message}`))
          }
        })
        
        // Parse the PDF buffer
        pdfParser.parseBuffer(buffer)
      })
    } catch (error) {
      console.error('PDF parsing error:', error)
      throw new Error(`PDF parsing failed: ${error.message}`)
    }
  }

  /**
   * Parse Excel/XLSX files and extract structured data
   */
  async parseExcel(buffer) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheets = []
      
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
        
        sheets.push({
          name: sheetName,
          data: jsonData,
          range: worksheet['!ref'] || 'A1:A1'
        })
      })
      
      const result = {
        sheets,
        text: this.convertSheetsToText(sheets),
        rawContent: sheets,
        confidence: 0.95, // Very high confidence for structured data
        extractionMethod: 'excel-structured'
      }
      
      console.log(`Excel parsed successfully: ${sheets.length} sheets`)
      return result
    } catch (error) {
      console.error('Excel parsing error:', error)
      throw new Error(`Excel parsing failed: ${error.message}`)
    }
  }

  /**
   * Parse CSV files
   */
  async parseCSV(buffer) {
    return new Promise((resolve, reject) => {
      const results = []
      const stream = Readable.from(buffer.toString())
      
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          const result = {
            data: results,
            text: this.convertCSVToText(results),
            rawContent: results,
            confidence: 0.95, // High confidence for structured CSV
            extractionMethod: 'csv-structured'
          }
          
          console.log(`CSV parsed successfully: ${results.length} rows`)
          resolve(result)
        })
        .on('error', (error) => {
          console.error('CSV parsing error:', error)
          reject(new Error(`CSV parsing failed: ${error.message}`))
        })
    })
  }

  /**
   * Parse image files (basic OCR preparation)
   */
  async parseImage(buffer) {
    try {
      //🔧 CRITICAL FIX: DO NOT include buffer data in return value
      // Buffers will bloat Redis/Bull queues with binary data (79KB+ per image)
      // Instead, return only metadata and let AI parsing stage download from storage
      
      const metadata = await sharp(buffer).metadata()
      
      const result = {
        // ❌ REMOVED: imageBuffer and originalBuffer (causes Redis bloat)
        // ✅ File will be downloaded from storage URL when needed in AI parsing
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: buffer.length
        },
        text: '', // Will be filled by OCR/AI service
        confidence: 0.7, // Lower confidence for images (depends on OCR)
        extractionMethod: 'image-needs-ai-parsing', // Signal that AI parsing needs to download file
        requiresFileDownload: true // Flag for AI parsing stage
      }
      
      console.log(`✅ Image metadata extracted: ${metadata.width}x${metadata.height} ${metadata.format} (${buffer.length} bytes)`)
      console.log(`📝 Note: Image buffer NOT included in workflow data to prevent Redis bloat`)
      return result
    } catch (error) {
      console.error('Image processing error:', error)
      throw new Error(`Image processing failed: ${error.message}`)
    }
  }

  /**
   * Convert Excel sheets to readable text
   */
  convertSheetsToText(sheets) {
    return sheets.map(sheet => {
      const text = sheet.data.map(row => 
        row.join('\t')
      ).join('\n')
      return `Sheet: ${sheet.name}\n${text}`
    }).join('\n\n')
  }

  /**
   * Convert CSV data to readable text
   */
  convertCSVToText(data) {
    if (!data.length) return ''
    
    const headers = Object.keys(data[0])
    let text = headers.join('\t') + '\n'
    
    data.forEach(row => {
      text += headers.map(header => row[header] || '').join('\t') + '\n'
    })
    
    return text
  }

  /**
   * Validate parsing results
   */
  validateParsingResult(result) {
    if (!result) {
      throw new Error('Parsing result is null or undefined')
    }
    
    if (!result.text && !result.rawContent) {
      throw new Error('No content extracted from file')
    }
    
    if (result.confidence < 0.1) {
      throw new Error('Parsing confidence too low')
    }
    
    return true
  }

  /**
   * Analyze text for artificial character spacing patterns
   * Used to detect PDFs with spacing issues like "I N V O I C E"
   */
  _analyzeCharacterSpacing(text) {
    const sampleSize = Math.min(1000, text.length)
    const sample = text.substring(0, sampleSize)
    
    // Count "word_char space word_char" patterns
    const singleCharSpaces = (sample.match(/\w \w/g) || []).length
    const totalWordChars = (sample.match(/\w/g) || []).length
    
    const ratio = totalWordChars > 0 ? singleCharSpaces / totalWordChars : 0
    
    // Threshold: >35% indicates artificial spacing
    return {
      hasArtificialSpacing: ratio > 0.35,
      ratio,
      singleCharSpaces,
      totalWordChars
    }
  }

  /**
   * Normalize artificial character spacing in entire document
   * Uses conservative approach to preserve document structure
   */
  _normalizeDocumentSpacing(text, analysis) {
    // Process line by line to maintain structure
    const lines = text.split('\n')
    const normalizedLines = lines.map(line => {
      if (!line || line.trim().length === 0) return line
      
      // Apply normalization based on severity
      if (analysis.ratio > 0.45) {
        // High ratio - use moderate normalization
        return this._moderateSpacingNormalization(line)
      } else {
        // Medium ratio - use conservative normalization  
        return this._conservativeSpacingNormalization(line)
      }
    })
    
    let normalized = normalizedLines.join('\n')
    
    // Apply post-processing fixes
    normalized = this._postProcessSpacingFixes(normalized)
    
    return normalized
  }

  /**
   * Moderate character spacing normalization
   * Removes patterns of 3+ single-char spaces
   * Uses aggressive approach to fully collapse spaced characters
   */
  _moderateSpacingNormalization(line) {
    let normalized = line
    
    // Phase 1: Iteratively collapse 3-char sequences
    let iterations = 0
    let prevNormalized
    do {
      prevNormalized = normalized
      normalized = normalized.replace(/(\w) (\w) (\w)/g, '$1$2$3')
      iterations++
    } while (normalized !== prevNormalized && iterations < 10)
    
    // Phase 2: Collapse any remaining single-char spacing
    // This catches leftover patterns like "Pri ce" → "Price"
    normalized = normalized.replace(/(\w) (?=\w)/g, '$1')
    
    return normalized
  }

  /**
   * Conservative character spacing normalization
   * Only removes patterns of 4+ single-char spaces
   */
  _conservativeSpacingNormalization(line) {
    let normalized = line
    
    // Only collapse 4+ char sequences to be safe
    let iterations = 0
    let prevNormalized
    do {
      prevNormalized = normalized
      normalized = normalized.replace(/(\w) (\w) (\w) (\w)/g, '$1$2$3$4')
      iterations++
    } while (normalized !== prevNormalized && iterations < 5)
    
    return normalized
  }

  /**
   * Post-process to fix common artifacts from spacing normalization
   */
  _postProcessSpacingFixes(text) {
    let fixed = text
    
    // Restore spaces between numbers and letters: "123abc" → "123 abc"
    fixed = fixed.replace(/(\d)([a-zA-Z])/g, '$1 $2')
    fixed = fixed.replace(/([a-zA-Z])(\d)/g, '$1 $2')
    
    // Restore spaces in compound words with common prepositions
    fixed = fixed.replace(/([a-z])(of)(\d)/gi, '$1 $2 $3') // "12of3" → "12 of 3"
    fixed = fixed.replace(/(Case|Pack|Box|Set|Bag|Pallet)(of)/gi, '$1 $2') // "Caseof" → "Case of"
    
    // Restore spaces around punctuation
    fixed = fixed.replace(/(\))([a-zA-Z])/g, '$1 $2')
    fixed = fixed.replace(/([a-zA-Z])(\()/g, '$1 $2')
    fixed = fixed.replace(/([.,;:!?])([A-Z])/g, '$1 $2')
    
    // Restore spaces before common units
    fixed = fixed.replace(/(\d+)(ml|g|kg|oz|lb|ct|pcs|ea|L|gal|qt|pt|cm|mm|m)\b/gi, '$1 $2')
    
    // Restore spaces in common patterns
    fixed = fixed.replace(/(\d+)(Case|Pack|Box|Unit|Bag|Pallet)\b/g, '$1 $2')
    
    // Fix camelCase → camel Case (but preserve legitimate camelCase like productCode)
    fixed = fixed.replace(/([a-z])([A-Z])/g, '$1 $2')
    
    return fixed
  }
}

export const fileParsingService = new FileParsingService()
export default fileParsingService