/**
 * Production Readiness Validation Script
 * Validates all API endpoints and configurations for production deployment
 */

import { validateProductionEndpoints, generateAPIDocumentation } from './src/lib/productionEndpoints.js'
import { validateProductionConfig } from './src/config/production.js'

async function validateProductionReadiness() {
  console.log('🚀 Production Readiness Validation')
  console.log('=' .repeat(50))
  
  const results = {
    environment: false,
    endpoints: false,
    services: false,
    security: false,
    warnings: []
  }
  
  try {
    // 1. Validate Environment Configuration
    console.log('\n📋 Step 1: Environment Configuration')
    try {
      const envConfig = validateProductionConfig()
      results.environment = true
      console.log('✅ Environment configuration validated')
      
      // Check critical services
      if (envConfig.database === 'not configured') {
        results.warnings.push('Database not configured')
      }
      if (envConfig.redis === 'not configured') {
        results.warnings.push('Redis not configured') 
      }
      if (envConfig.openai === 'not configured') {
        results.warnings.push('OpenAI API not configured')
      }
      
    } catch (error) {
      console.error('❌ Environment validation failed:', error.message)
      results.warnings.push(`Environment: ${error.message}`)
    }
    
    // 2. Validate API Endpoints
    console.log('\n🌐 Step 2: API Endpoint Configuration')
    try {
      const endpointResults = await validateProductionEndpoints()
      results.endpoints = endpointResults.success
      
      if (endpointResults.success) {
        console.log(`✅ All ${endpointResults.configured} required endpoints configured`)
      } else {
        console.log(`❌ ${endpointResults.missing} endpoints missing`)
        results.warnings.push(`Missing ${endpointResults.missing} endpoints`)
      }
      
    } catch (error) {
      console.error('❌ Endpoint validation failed:', error.message)
      results.warnings.push(`Endpoints: ${error.message}`)
    }
    
    // 3. Validate Service Dependencies
    console.log('\n🔧 Step 3: Service Dependencies')
    try {
      await validateServiceDependencies()
      results.services = true
      console.log('✅ Service dependencies validated')
    } catch (error) {
      console.error('❌ Service validation failed:', error.message)
      results.warnings.push(`Services: ${error.message}`)
    }
    
    // 4. Security Configuration
    console.log('\n🔒 Step 4: Security Configuration')
    try {
      validateSecurityConfig()
      results.security = true
      console.log('✅ Security configuration validated')
    } catch (error) {
      console.error('❌ Security validation failed:', error.message)
      results.warnings.push(`Security: ${error.message}`)
    }
    
    // 5. Generate Production Documentation
    console.log('\n📚 Step 5: Documentation Generation')
    try {
      const docs = generateAPIDocumentation()
      console.log('✅ API documentation generated')
      
      // Save documentation to file
      const fs = await import('fs/promises')
      await fs.writeFile('./production-api-docs.json', JSON.stringify(docs, null, 2))
      console.log('📄 Documentation saved to production-api-docs.json')
      
    } catch (error) {
      console.error('❌ Documentation generation failed:', error.message)
      results.warnings.push(`Documentation: ${error.message}`)
    }
    
    // Final Results
    console.log('\n🎯 Production Readiness Summary')
    console.log('=' .repeat(50))
    
    const allValid = results.environment && results.endpoints && results.services && results.security
    
    if (allValid) {
      console.log('🎉 Production Ready! All validations passed.')
      console.log('✅ Environment: Configured')
      console.log('✅ Endpoints: All configured') 
      console.log('✅ Services: All dependencies met')
      console.log('✅ Security: Properly configured')
    } else {
      console.log('⚠️ Production deployment needs attention:')
      if (!results.environment) console.log('❌ Environment: Issues found')
      if (!results.endpoints) console.log('❌ Endpoints: Missing endpoints')
      if (!results.services) console.log('❌ Services: Dependency issues') 
      if (!results.security) console.log('❌ Security: Configuration issues')
    }
    
    if (results.warnings.length > 0) {
      console.log('\\n⚠️ Warnings to address:')
      results.warnings.forEach(warning => {
        console.log(`   - ${warning}`)
      })
    }
    
    console.log('\\n📋 Next Steps for Production:')
    console.log('1. Address any warnings or errors above')
    console.log('2. Set up monitoring and alerting')
    console.log('3. Configure backup and disaster recovery')
    console.log('4. Set up CI/CD pipeline')
    console.log('5. Perform load testing')
    
    return {
      ready: allValid,
      results,
      warnings: results.warnings
    }
    
  } catch (error) {
    console.error('🚨 Critical validation error:', error)
    return {
      ready: false,
      error: error.message,
      results
    }
  }
}

/**
 * Validate service dependencies (Redis, Database, OpenAI)
 */
async function validateServiceDependencies() {
  const services = []
  
  // Test Redis connection
  try {
    const { redisManager } = await import('./src/lib/redisManager.js')
    const redisHealth = await redisManager.healthCheck()
    if (redisHealth.status === 'healthy') {
      services.push('✅ Redis: Connected')
    } else {
      throw new Error(`Redis health check failed: ${redisHealth.status}`)
    }
  } catch (error) {
    services.push(`❌ Redis: ${error.message}`)
    throw new Error('Redis validation failed')
  }
  
  // Test Database connection
  try {
    const { db } = await import('./src/lib/db.js')
    await db.raw('SELECT 1')
    services.push('✅ Database: Connected')
  } catch (error) {
    services.push(`❌ Database: ${error.message}`)
    throw new Error('Database validation failed')
  }
  
  // Test OpenAI API
  try {
    if (process.env.OPENAI_API_KEY) {
      // Simple API key format validation
      if (process.env.OPENAI_API_KEY.startsWith('sk-')) {
        services.push('✅ OpenAI: API key configured')
      } else {
        throw new Error('Invalid OpenAI API key format')
      }
    } else {
      throw new Error('OpenAI API key not configured')
    }
  } catch (error) {
    services.push(`❌ OpenAI: ${error.message}`)
    throw new Error('OpenAI validation failed')
  }
  
  services.forEach(service => console.log(`   ${service}`))
}

/**
 * Validate security configuration
 */
function validateSecurityConfig() {
  const security = []
  
  // Check JWT secret
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
    security.push('✅ JWT Secret: Properly configured')
  } else {
    security.push('❌ JWT Secret: Missing or too short')
    throw new Error('JWT secret validation failed')
  }
  
  // Check Admin API key
  if (process.env.ADMIN_API_KEY && process.env.ADMIN_API_KEY.length >= 32) {
    security.push('✅ Admin API Key: Properly configured')
  } else {
    security.push('❌ Admin API Key: Missing or too short')
    throw new Error('Admin API key validation failed')
  }
  
  // Check session secret
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    security.push('✅ Session Secret: Properly configured')
  } else {
    security.push('❌ Session Secret: Missing or too short')
    throw new Error('Session secret validation failed')
  }
  
  // Check HTTPS in production
  if (process.env.NODE_ENV === 'production') {
    if (process.env.SHOPIFY_APP_URL && process.env.SHOPIFY_APP_URL.startsWith('https://')) {
      security.push('✅ HTTPS: Properly configured')
    } else {
      security.push('❌ HTTPS: App URL must use HTTPS in production')
      throw new Error('HTTPS validation failed')
    }
  }
  
  security.forEach(check => console.log(`   ${check}`))
}

// Run validation if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateProductionReadiness()
    .then(result => {
      process.exit(result.ready ? 0 : 1)
    })
    .catch(error => {
      console.error('Validation script failed:', error)
      process.exit(1)
    })
}

export { validateProductionReadiness }