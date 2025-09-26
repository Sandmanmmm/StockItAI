/**
 * Production AI Processing Format Standard
 * This defines the expected structure for AI processing results
 */

export const AI_PROCESSING_FORMAT = {
  // Processing metadata
  success: true, // boolean - processing success status
  model: 'gpt-4o-mini', // string - AI model used
  tokensUsed: 824, // number - total tokens consumed
  processingTime: 7931, // number - processing time in milliseconds
  processingMethod: 'text-gpt4-mini-fallback', // string - processing method used
  inputType: 'text', // string - input type (text, pdf, image)
  
  // Document classification
  documentType: 'purchase_order', // string - classified document type
  industry: 'technology', // string - detected industry
  
  // Quality metrics
  confidence: {
    overall: 85, // number 0-100 - overall extraction confidence
    poNumber: 95, // number 0-100 - PO number confidence
    vendor: 90, // number 0-100 - vendor information confidence
    lineItems: 80, // number 0-100 - line items confidence
    totals: 85 // number 0-100 - totals confidence
  },
  dataQuality: 'excellent', // string - overall data quality assessment
  
  // Extracted structured data
  extractedData: {
    // Core purchase order information
    poNumber: 'PO-2025-001',
    orderDate: '2025-09-23',
    dueDate: '2025-10-15',
    currency: 'USD',
    
    // Vendor information
    vendor: {
      name: 'TechSupplies Inc.',
      email: 'orders@techsupplies.com',
      phone: '(555) 123-4567',
      address: '123 Tech Street, Silicon Valley, CA 94000',
      website: null
    },
    
    // Shipping information
    shipTo: {
      name: 'OrderFlow AI Solutions',
      address: '456 Business Ave, San Francisco, CA 94105'
    },
    
    // Line items
    lineItems: [
      {
        sku: 'KB-2025', // string - product SKU/model
        productName: 'Wireless Keyboards - Model KB-2025', // string - product name
        description: 'Wireless Keyboards - Model KB-2025', // string - detailed description
        quantity: 10, // number - quantity ordered
        unitPrice: 45.99, // number - price per unit
        totalPrice: 459.90, // number - total line price
        category: 'electronics' // string - product category
      },
      {
        sku: 'MS-Pro',
        productName: 'Optical Mice - Model MS-Pro',
        description: 'Optical Mice - Model MS-Pro',
        quantity: 10,
        unitPrice: 29.99,
        totalPrice: 299.90,
        category: 'electronics'
      },
      {
        sku: 'USB-TC-6FT',
        productName: 'USB Cables - 6ft Type-C',
        description: 'USB Cables - 6ft Type-C x 25',
        quantity: 25,
        unitPrice: 8.99,
        totalPrice: 224.75,
        category: 'electronics'
      },
      {
        sku: 'STAND-ADJ',
        productName: 'Monitor Stands - Adjustable',
        description: 'Monitor Stands - Adjustable x 5',
        quantity: 5,
        unitPrice: 89.99,
        totalPrice: 449.95,
        category: 'electronics'
      }
    ],
    
    // Financial totals
    totals: {
      subtotal: 1434.50, // number - subtotal before tax/shipping
      tax: 121.93, // number - tax amount
      taxRate: 8.5, // number - tax rate percentage
      shipping: 25.00, // number - shipping cost
      discount: 0.00, // number - discount amount
      total: 1581.43 // number - final total amount
    },
    
    // Additional terms and conditions
    terms: {
      paymentTerms: 'Net 30', // string - payment terms
      deliveryDate: '2025-10-15', // string - expected delivery date
      notes: null // string - additional notes
    }
  },
  
  // Processing warnings/notes
  warnings: [], // array of strings - processing warnings
  processingNotes: 'Successfully extracted all key fields with high confidence'
}

// Standard error format
export const AI_ERROR_FORMAT = {
  success: false,
  error: 'Error message here',
  model: 'gpt-4o-mini',
  tokensUsed: 0,
  processingTime: 1234,
  processingMethod: 'failed',
  inputType: 'text',
  documentType: 'unknown',
  industry: null,
  confidence: { overall: 0 },
  dataQuality: 'poor',
  extractedData: null,
  warnings: ['Processing failed due to...'],
  processingNotes: 'Failed to extract data'
}

/**
 * Validation function for AI processing results
 */
export function validateAIResult(result) {
  const errors = []
  
  // Check required fields
  if (typeof result.success !== 'boolean') errors.push('success must be boolean')
  if (typeof result.model !== 'string') errors.push('model must be string')
  if (typeof result.tokensUsed !== 'number') errors.push('tokensUsed must be number')
  if (typeof result.processingTime !== 'number') errors.push('processingTime must be number')
  
  if (result.success) {
    if (!result.extractedData) errors.push('extractedData is required for successful processing')
    if (!result.confidence || typeof result.confidence.overall !== 'number') {
      errors.push('confidence.overall must be a number')
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

export default { AI_PROCESSING_FORMAT, AI_ERROR_FORMAT, validateAIResult }