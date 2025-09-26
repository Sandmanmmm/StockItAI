/**
 * Production API Endpoint Validation & Documentation
 * Ensures all endpoints are properly configured for production deployment
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Complete API endpoint mapping for production
 */
export const productionEndpoints = {
  // Health & Status
  health: {
    path: '/api/health',
    method: 'GET',
    auth: 'none',
    description: 'System health check',
    required: true
  },

  // Authentication
  auth: {
    callback: {
      path: '/auth/callback',
      method: 'GET',
      auth: 'shopify_oauth',
      description: 'Shopify OAuth callback',
      required: true
    },
    shopifyCallback: {
      path: '/auth/shopify/callback', 
      method: 'GET',
      auth: 'shopify_oauth',
      description: 'Shopify OAuth callback alternate',
      required: true
    }
  },

  // Core Business Logic
  purchaseOrders: {
    list: {
      path: '/api/purchase-orders',
      method: 'GET',
      auth: 'shopify_session',
      description: 'List purchase orders',
      required: true
    },
    create: {
      path: '/api/purchase-orders',
      method: 'POST', 
      auth: 'shopify_session',
      description: 'Create purchase order',
      required: true
    },
    get: {
      path: '/api/purchase-orders/:id',
      method: 'GET',
      auth: 'shopify_session', 
      description: 'Get purchase order by ID',
      required: true
    },
    update: {
      path: '/api/purchase-orders/:id',
      method: 'PUT',
      auth: 'shopify_session',
      description: 'Update purchase order',
      required: true
    },
    delete: {
      path: '/api/purchase-orders/:id',
      method: 'DELETE',
      auth: 'shopify_session',
      description: 'Delete purchase order',
      required: true
    }
  },

  // File Upload & Processing
  upload: {
    document: {
      path: '/api/upload/document',
      method: 'POST',
      auth: 'shopify_session',
      description: 'Upload document for processing',
      required: true
    },
    status: {
      path: '/api/upload/status/:uploadId',
      method: 'GET', 
      auth: 'shopify_session',
      description: 'Get upload processing status',
      required: true
    }
  },

  // Workflow Management
  workflow: {
    start: {
      path: '/api/workflow/start',
      method: 'POST',
      auth: 'shopify_session',
      description: 'Start workflow processing',
      required: true
    },
    status: {
      path: '/api/workflow/status/:workflowId',
      method: 'GET',
      auth: 'shopify_session', 
      description: 'Get workflow status',
      required: true
    },
    cancel: {
      path: '/api/workflow/cancel/:workflowId',
      method: 'POST',
      auth: 'shopify_session',
      description: 'Cancel workflow',
      required: true
    }
  },

  // Merchant Status & Error Handling
  merchant: {
    status: {
      path: '/api/merchant/status/:workflowId',
      method: 'GET',
      auth: 'shopify_session',
      description: 'Get merchant-friendly workflow status',
      required: true
    },
    statusList: {
      path: '/api/merchant/status',
      method: 'GET',
      auth: 'shopify_session',
      description: 'List all workflow statuses for merchant',
      required: true
    },
    retry: {
      path: '/api/merchant/retry/:workflowId',
      method: 'POST',
      auth: 'shopify_session',
      description: 'Retry failed workflow',
      required: true
    },
    approve: {
      path: '/api/merchant/approve/:workflowId',
      method: 'POST',
      auth: 'shopify_session',
      description: 'Approve workflow requiring manual review',
      required: true
    }
  },

  // Job Management & Monitoring
  jobs: {
    summary: {
      path: '/api/jobs/summary',
      method: 'GET',
      auth: 'shopify_session',
      description: 'Job processing summary',
      required: true
    },
    status: {
      path: '/api/jobs/status/:type',
      method: 'GET',
      auth: 'shopify_session',
      description: 'Get jobs by status type',
      required: true
    },
    retry: {
      path: '/api/jobs/retry/:jobId',
      method: 'POST',
      auth: 'shopify_session',
      description: 'Retry failed job',
      required: true
    },
    delete: {
      path: '/api/jobs/:jobId',
      method: 'DELETE',
      auth: 'shopify_session',
      description: 'Delete job',
      required: true
    }
  },

  // Admin & Monitoring (Production)
  monitoring: {
    dashboard: {
      path: '/api/monitoring/dashboard',
      method: 'GET',
      auth: 'admin_key',
      description: 'System monitoring dashboard',
      required: true,
      productionOnly: true
    },
    queues: {
      path: '/api/monitoring/queues',
      method: 'GET',
      auth: 'admin_key',
      description: 'Queue health monitoring',
      required: true,
      productionOnly: true
    }
  },

  analytics: {
    summary: {
      path: '/api/analytics/summary',
      method: 'GET',
      auth: 'admin_key',
      description: 'Analytics summary',
      required: true,
      productionOnly: true
    }
  },

  // Dead Letter Queue Management
  dlq: {
    list: {
      path: '/api/dlq/list',
      method: 'GET',
      auth: 'admin_key',
      description: 'List dead letter queue items',
      required: true,
      productionOnly: true
    },
    retry: {
      path: '/api/dlq/retry/:workflowId',
      method: 'POST',
      auth: 'admin_key',
      description: 'Retry item from dead letter queue',
      required: true,
      productionOnly: true
    }
  }
}

/**
 * Validate that all production endpoints are properly configured
 */
export async function validateProductionEndpoints() {
  console.log('🔍 Validating production API endpoints...')
  
  const results = {
    configured: [],
    missing: [],
    warnings: []
  }
  
  try {
    // Read server.js to check configured routes
    const serverPath = join(__dirname, 'server.js')
    const serverContent = await fs.readFile(serverPath, 'utf8')
    
    // Read route files to check endpoint implementations
    const routesDir = join(__dirname, 'routes')
    const routeFiles = await fs.readdir(routesDir)
    
    console.log(`📁 Found ${routeFiles.length} route files`)
    
    // Check each endpoint category
    for (const [category, endpoints] of Object.entries(productionEndpoints)) {
      console.log(`\n📊 Checking ${category} endpoints...`)
      
      if (typeof endpoints === 'object' && endpoints.path) {
        // Single endpoint
        await checkEndpoint(category, endpoints, serverContent, results)
      } else {
        // Endpoint group
        for (const [name, endpoint] of Object.entries(endpoints)) {
          await checkEndpoint(`${category}.${name}`, endpoint, serverContent, results)
        }
      }
    }
    
    // Report results
    console.log('\n📈 Endpoint Validation Results:')
    console.log(`✅ Configured: ${results.configured.length}`)
    console.log(`❌ Missing: ${results.missing.length}`)
    console.log(`⚠️ Warnings: ${results.warnings.length}`)
    
    if (results.missing.length > 0) {
      console.log('\n❌ Missing Endpoints:')
      results.missing.forEach(endpoint => {
        console.log(`   - ${endpoint}`)
      })
    }
    
    if (results.warnings.length > 0) {
      console.log('\n⚠️ Warnings:')
      results.warnings.forEach(warning => {
        console.log(`   - ${warning}`)
      })
    }
    
    return {
      success: results.missing.length === 0,
      configured: results.configured.length,
      missing: results.missing.length,
      warnings: results.warnings.length,
      details: results
    }
    
  } catch (error) {
    console.error('❌ Endpoint validation failed:', error)
    throw error
  }
}

/**
 * Check if a specific endpoint is configured
 */
async function checkEndpoint(name, endpoint, serverContent, results) {
  try {
    // Skip production-only endpoints in development
    if (endpoint.productionOnly && process.env.NODE_ENV !== 'production') {
      results.warnings.push(`${name}: Production-only endpoint, skipping in ${process.env.NODE_ENV}`)
      return
    }
    
    // Check if route is registered in server.js
    const routePattern = endpoint.path.replace(/:\w+/g, '\\w+')
    const routeRegex = new RegExp(`['"]${routePattern}['"]`, 'i')
    
    if (serverContent.match(routeRegex)) {
      results.configured.push(`${name}: ${endpoint.method} ${endpoint.path}`)
    } else {
      // Check if it might be in a route file
      const routeFilePattern = endpoint.path.split('/')[2] // e.g., 'purchase-orders' from '/api/purchase-orders'
      if (routeFilePattern && serverContent.includes(routeFilePattern)) {
        results.configured.push(`${name}: ${endpoint.method} ${endpoint.path} (via route file)`)
      } else {
        results.missing.push(`${name}: ${endpoint.method} ${endpoint.path}`)
      }
    }
    
  } catch (error) {
    results.warnings.push(`${name}: Error checking endpoint - ${error.message}`)
  }
}

/**
 * Generate API documentation for production deployment
 */
export function generateAPIDocumentation() {
  console.log('📚 Generating API Documentation...')
  
  const docs = {
    title: 'Shopify PO Sync Pro API',
    version: '1.0.0',
    baseUrl: process.env.SHOPIFY_APP_URL || 'https://your-app.com',
    authentication: {
      types: {
        none: 'No authentication required',
        shopify_session: 'Shopify session token in Authorization header',
        admin_key: 'Admin API key in X-Admin-Key header',
        shopify_oauth: 'Shopify OAuth flow'
      }
    },
    endpoints: productionEndpoints,
    examples: {
      curl: {
        merchantStatus: `curl -X GET '${process.env.SHOPIFY_APP_URL || 'https://your-app.com'}/api/merchant/status/workflow-123' \\
  -H 'Authorization: Bearer YOUR_SESSION_TOKEN'`,
        healthCheck: `curl -X GET '${process.env.SHOPIFY_APP_URL || 'https://your-app.com'}/api/health'`
      }
    }
  }
  
  return docs
}

// Export for use in tests and deployment scripts
export default {
  productionEndpoints,
  validateProductionEndpoints,
  generateAPIDocumentation
}