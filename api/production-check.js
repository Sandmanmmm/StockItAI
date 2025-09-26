/**
 * Simple Production Readiness Check
 */

// Load environment variables first
import dotenv from 'dotenv'
dotenv.config() // Load from .env in current directory

console.log('🚀 Shopify PO Sync Pro - Production Readiness Check')
console.log('=' .repeat(60))

// Check Node.js version
const nodeVersion = process.version
console.log(`📟 Node.js Version: ${nodeVersion}`)

// Check environment variables
console.log('\n📋 Environment Configuration:')
const requiredEnvVars = [
  'NODE_ENV',
  'API_PORT', 
  'DATABASE_URL',
  'REDIS_HOST',
  'SHOPIFY_API_KEY',
  'SHOPIFY_API_SECRET', 
  'OPENAI_API_KEY',
  'JWT_SECRET',
  'SESSION_SECRET',
  'ADMIN_API_KEY'
]

const configured = []
const missing = []

requiredEnvVars.forEach(varName => {
  if (process.env[varName]) {
    configured.push(varName)
    if (varName.includes('SECRET') || varName.includes('KEY')) {
      console.log(`✅ ${varName}: ***configured***`)
    } else {
      console.log(`✅ ${varName}: ${process.env[varName]}`)
    }
  } else {
    missing.push(varName)
    console.log(`❌ ${varName}: NOT SET`)
  }
})

console.log(`\n📊 Environment Summary:`)
console.log(`✅ Configured: ${configured.length}`)
console.log(`❌ Missing: ${missing.length}`)

// Check API endpoints structure
console.log('\n🌐 API Endpoint Structure:')
try {
  const fs = await import('fs/promises')
  const path = await import('path')
  
  const routesDir = path.join(process.cwd(), 'src', 'routes')
  try {
    const routeFiles = (await fs.readdir(routesDir)).filter(f => f.endsWith('.js'))
    console.log(`📁 Route files found: ${routeFiles.length}`)
    routeFiles.forEach(file => {
      console.log(`   - ${file}`)
    })
  } catch (err) {
    console.log('❌ Routes directory not found')
  }
  
  const serverPath = path.join(process.cwd(), 'src', 'server.js')
  try {
    await fs.access(serverPath)
    console.log('✅ Server file exists')
  } catch (err) {
    console.log('❌ Server file not found')
  }
  
} catch (error) {
  console.log(`❌ Error checking files: ${error.message}`)
}

// Production recommendations
console.log('\n🎯 Production Readiness Summary:')
if (missing.length === 0) {
  console.log('🎉 All required environment variables configured!')
} else {
  console.log('⚠️ Missing required environment variables - production deployment will fail')
}

console.log('\n📋 Production Deployment Checklist:')
console.log('□ Environment variables configured')
console.log('□ Database migrations run')
console.log('□ Redis server accessible') 
console.log('□ OpenAI API key valid')
console.log('□ Shopify app registered')
console.log('□ HTTPS certificate configured')
console.log('□ Monitoring and alerting set up')
console.log('□ Backup strategy implemented')
console.log('□ Load balancing configured')
console.log('□ CI/CD pipeline ready')

console.log('\n🚀 Next Steps:')
console.log('1. Fix missing environment variables')
console.log('2. Test API endpoints with: npm run test')
console.log('3. Run load tests')
console.log('4. Deploy to staging environment')
console.log('5. Perform end-to-end testing')

if (missing.length > 0) {
  console.log('\n❌ Production readiness: FAILED')
  process.exit(1)
} else {
  console.log('\n✅ Production readiness: PASSED')
  process.exit(0)
}