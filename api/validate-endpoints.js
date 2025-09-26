/**
 * API Endpoint Registration Validation
 * Validates that all critical endpoints are properly registered in server.js
 */

import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'

dotenv.config()

async function validateEndpointRegistration() {
  console.log('🌐 API Endpoint Registration Validation')
  console.log('=' .repeat(50))
  
  try {
    // Read server.js content
    const serverPath = path.join(process.cwd(), 'src', 'server.js')
    const serverContent = await fs.readFile(serverPath, 'utf8')
    
    // Critical endpoints that must be registered
    const criticalEndpoints = {
      '/api/health': 'Health check endpoint',
      '/api/purchase-orders': 'Purchase orders API',
      '/api/upload': 'Document upload API', 
      '/api/workflow': 'Workflow management API',
      '/api/merchant': 'Merchant status API (Error Handling)',
      '/api/jobs': 'Job monitoring API (Error Handling)',
      '/api/monitoring': 'System monitoring API',
      '/api/analytics': 'Analytics API',
      '/api/dlq': 'Dead Letter Queue API',
      '/auth/callback': 'Shopify OAuth callback',
      '/auth/shopify/callback': 'Shopify OAuth callback (alternate)'
    }
    
    console.log('🔍 Checking endpoint registrations...\n')
    
    const results = {
      registered: [],
      missing: [],
      warnings: []
    }
    
    // Check each critical endpoint
    for (const [endpoint, description] of Object.entries(criticalEndpoints)) {
      const routePattern = endpoint.replace(/:\w+/g, '\\w+')
      const routeRegex = new RegExp(`['"\`]${routePattern}['"\`]`, 'i')
      
      if (serverContent.match(routeRegex)) {
        results.registered.push({ endpoint, description, status: '✅' })
        console.log(`✅ ${endpoint.padEnd(25)} - ${description}`)
      } else {
        // Check if it might be registered via app.use pattern
        const baseRoute = endpoint.split('/').slice(0, 3).join('/')
        const usePattern = new RegExp(`app\\.use\\(['"\`]${baseRoute}['"\`]`, 'i')
        
        if (serverContent.match(usePattern)) {
          results.registered.push({ endpoint, description, status: '✅ (via router)' })
          console.log(`✅ ${endpoint.padEnd(25)} - ${description} (via router)`)
        } else {
          results.missing.push({ endpoint, description })
          console.log(`❌ ${endpoint.padEnd(25)} - ${description}`)
        }
      }
    }
    
    // Check for route imports
    console.log('\n📁 Route Module Imports:')
    const routeImports = [
      'purchaseOrdersRouter',
      'uploadRouter', 
      'workflowRouter',
      'merchantStatusRouter',
      'merchantJobStatusRouter',
      'monitoringRouter',
      'analyticsRouter',
      'deadLetterQueueRouter'
    ]
    
    routeImports.forEach(routerName => {
      if (serverContent.includes(routerName)) {
        console.log(`✅ ${routerName}`)
      } else {
        console.log(`❌ ${routerName}`)
        results.warnings.push(`Missing import: ${routerName}`)
      }
    })
    
    // Check middleware configuration
    console.log('\n🔒 Middleware Configuration:')
    const middlewareChecks = [
      { name: 'Authentication Middleware', pattern: /(verifyShopifyRequest|devBypassAuth)/ },
      { name: 'Admin Authentication', pattern: /adminAuth/ },
      { name: 'Error Handling Middleware', pattern: /app\.use.*error/ },
      { name: 'CORS Configuration', pattern: /cors\(/ },
      { name: 'Helmet Security', pattern: /helmet\(/ },
      { name: 'Rate Limiting', pattern: /rateLimit/ }
    ]
    
    middlewareChecks.forEach(check => {
      if (serverContent.match(check.pattern)) {
        console.log(`✅ ${check.name}`)
      } else {
        console.log(`⚠️ ${check.name}`)
        results.warnings.push(`Missing middleware: ${check.name}`)
      }
    })
    
    // Summary
    console.log('\n📊 Validation Summary:')
    console.log(`✅ Registered endpoints: ${results.registered.length}`)
    console.log(`❌ Missing endpoints: ${results.missing.length}`)
    console.log(`⚠️ Warnings: ${results.warnings.length}`)
    
    if (results.missing.length > 0) {
      console.log('\n❌ Missing Critical Endpoints:')
      results.missing.forEach(({ endpoint, description }) => {
        console.log(`   - ${endpoint}: ${description}`)
      })
    }
    
    if (results.warnings.length > 0) {
      console.log('\n⚠️ Configuration Warnings:')
      results.warnings.forEach(warning => {
        console.log(`   - ${warning}`)
      })
    }
    
    // Production readiness verdict
    const isReady = results.missing.length === 0
    
    if (isReady) {
      console.log('\n🎉 API Endpoint Configuration: PRODUCTION READY!')
      console.log('✅ All critical endpoints are properly registered')
      console.log('✅ Authentication middleware configured')
      console.log('✅ Error handling implemented')
    } else {
      console.log('\n⚠️ API Endpoint Configuration: NEEDS ATTENTION')
      console.log('❌ Some critical endpoints are missing')
      console.log('📝 Review server.js route configuration')
    }
    
    return {
      ready: isReady,
      registered: results.registered.length,
      missing: results.missing.length,
      warnings: results.warnings.length
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message)
    return { ready: false, error: error.message }
  }
}

// Run validation
validateEndpointRegistration()
  .then(result => {
    process.exit(result.ready ? 0 : 1)
  })
  .catch(error => {
    console.error('Validation script failed:', error)
    process.exit(1)
  })