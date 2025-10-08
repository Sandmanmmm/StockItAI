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
  async parseFile(buffer, mimeType, fileName) {
    try {
      console.log(`Starting file parsing for ${fileName} (${mimeType})`)
      
      switch (mimeType) {
        case 'application/pdf':
          return await this.parsePDF(buffer)
        
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
   */
  async parsePDF(buffer) {
    try {
      // Use pdf2json which is serverless-compatible
      const PDFParser = (await import('pdf2json')).default
      
      return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser()
        
        pdfParser.on('pdfParser_dataError', (errData) => {
          console.error('PDF parsing error:', errData.parserError)
          reject(new Error(`PDF parsing failed: ${errData.parserError}`))
        })
        
        pdfParser.on('pdfParser_dataReady', (pdfData) => {
          try {
            // Extract text from all pages
            const pages = pdfData.Pages || []
            const pageTexts = pages.map(page => {
              const texts = page.Texts || []
              return texts.map(text => {
                return decodeURIComponent(text.R[0].T || '')
              }).join(' ')
            })
            
            const fullText = pageTexts.join('\n\n')
            
            const result = {
              text: fullText.trim(),
              pages: pages.length,
              pageTexts,
              metadata: {
                numPages: pages.length,
                extractedAt: new Date().toISOString()
              },
              rawContent: fullText.trim(),
              confidence: 0.9,
              extractionMethod: 'pdf2json-v3'
            }
            
            console.log(`PDF parsed successfully: ${result.pages} pages, ${result.text.length} characters`)
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
      // Process image for better OCR results
      const processedBuffer = await sharp(buffer)
        .greyscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer()
      
      const metadata = await sharp(buffer).metadata()
      
      const result = {
        imageBuffer: processedBuffer,
        originalBuffer: buffer,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: buffer.length
        },
        text: '', // Will be filled by OCR service
        confidence: 0.7, // Lower confidence for images (depends on OCR)
        extractionMethod: 'image-ocr-ready'
      }
      
      console.log(`Image processed successfully: ${metadata.width}x${metadata.height} ${metadata.format}`)
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
}

export const fileParsingService = new FileParsingService()
export default fileParsingService