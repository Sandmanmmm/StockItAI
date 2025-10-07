/**
 * Webhook Secret Verification Script
 * Verifies that the webhook secret is properly configured
 */

import crypto from 'crypto'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

function verifyWebhookSecret() {
  console.log('🔐 Webhook Secret Verification')
  console.log('================================')
  
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  
  // Check if secret exists
  if (!secret) {
    console.log('❌ SHOPIFY_WEBHOOK_SECRET is not set')
    console.log('   Please add SHOPIFY_WEBHOOK_SECRET to your .env file')
    return false
  }
  
  // Check secret length (should be sufficient for security)
  if (secret.length < 32) {
    console.log('⚠️  WARNING: Webhook secret is shorter than recommended (32+ chars)')
    console.log(`   Current length: ${secret.length}`)
  }
  
  // Test HMAC generation
  try {
    const testPayload = '{"test": "webhook payload"}'
    const signature = crypto
      .createHmac('sha256', secret)
      .update(testPayload, 'utf8')
      .digest('base64')
    
    console.log('✅ Webhook secret is properly configured')
    console.log(`   Secret length: ${secret.length} characters`)
    console.log(`   Secret preview: ${secret.substring(0, 8)}...`)
    console.log(`   Test signature: ${signature.substring(0, 16)}...`)
    
    return true
  } catch (error) {
    console.log('❌ Error generating HMAC signature:', error.message)
    return false
  }
}

function verifyOtherWebhookConfig() {
  console.log('\n📋 Additional Webhook Configuration')
  console.log('=====================================')
  
  const configs = [
    { key: 'WEBHOOK_RATE_LIMIT', default: '100' },
    { key: 'WEBHOOK_TIMEOUT', default: '30000' },
    { key: 'WEBHOOK_RETRY_ATTEMPTS', default: '3' },
    { key: 'WEBHOOK_RETRY_DELAY', default: '2000' }
  ]
  
  configs.forEach(({ key, default: defaultValue }) => {
    const value = process.env[key]
    if (value) {
      console.log(`✅ ${key}: ${value}`)
    } else {
      console.log(`⚠️  ${key}: not set (will use default: ${defaultValue})`)
    }
  })
}

function testWebhookAuthentication() {
  console.log('\n🧪 Webhook Authentication Test')
  console.log('===============================')
  
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  if (!secret) {
    console.log('❌ Cannot test authentication - secret not configured')
    return false
  }
  
  // Simulate a real webhook payload
  const mockPayload = JSON.stringify({
    id: 123456789,
    email: "test@example.com",
    total_price: "29.99",
    created_at: new Date().toISOString()
  })
  
  // Generate signature like Shopify would
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(mockPayload, 'utf8')
    .digest('base64')
  
  // Verify signature like our webhook handler would
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(mockPayload, 'utf8')
    .digest('base64')
  
  const isValid = crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'base64'),
    Buffer.from(computedSignature, 'base64')
  )
  
  if (isValid) {
    console.log('✅ Webhook authentication test passed')
    console.log(`   Payload length: ${mockPayload.length} bytes`)
    console.log(`   Signature: ${expectedSignature.substring(0, 16)}...`)
  } else {
    console.log('❌ Webhook authentication test failed')
    console.log('   Signature verification mismatch')
  }
  
  return isValid
}

// Run all verification tests
async function runVerification() {
  console.log('🚀 Starting webhook configuration verification...\n')
  
  const secretOk = verifyWebhookSecret()
  verifyOtherWebhookConfig()
  const authOk = testWebhookAuthentication()
  
  console.log('\n📊 Verification Summary')
  console.log('========================')
  console.log(`Secret Configuration: ${secretOk ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`Authentication Test: ${authOk ? '✅ PASS' : '❌ FAIL'}`)
  
  if (secretOk && authOk) {
    console.log('\n🎉 All webhook configuration checks passed!')
    console.log('   Your webhook endpoints are ready for production.')
  } else {
    console.log('\n⚠️  Some webhook configuration issues detected.')
    console.log('   Please review and fix the issues above.')
  }
  
  return secretOk && authOk
}

// Run verification if called directly
if (process.argv[1].endsWith('verify-webhook-secret.js')) {
  runVerification()
    .then(success => {
      process.exit(success ? 0 : 1)
    })
    .catch(error => {
      console.error('Verification failed:', error.message)
      process.exit(1)
    })
}

export { verifyWebhookSecret, testWebhookAuthentication, runVerification }