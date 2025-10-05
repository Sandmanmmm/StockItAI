/**
 * Test script to verify the frontend API configuration with the new Cloudflare tunnel URL
 */

console.log('🧪 Testing Frontend API Configuration with Cloudflare Tunnel')

// Test the environment variable loading
const API_BASE_URL = process.env.VITE_API_BASE_URL || 'fallback-not-set'
console.log('📡 API Base URL from environment:', API_BASE_URL)

// Test the expected endpoints
const endpoints = {
  health: `${API_BASE_URL}/api/health`,
  upload: `${API_BASE_URL}/api/upload/po-file`,
  status: `${API_BASE_URL}/api/upload/status/:uploadId`
}

console.log('🔗 Expected API Endpoints:')
Object.entries(endpoints).forEach(([name, url]) => {
  console.log(`  ${name}: ${url}`)
})

// Verify the tunnel URL format
const expectedTunnelUrl = 'https://hitachi-jeff-amy-knows.trycloudflare.com'
if (API_BASE_URL === expectedTunnelUrl) {
  console.log('✅ Configuration correctly points to Cloudflare tunnel')
} else {
  console.log('❌ Configuration mismatch!')
  console.log('  Expected:', expectedTunnelUrl)
  console.log('  Actual:', API_BASE_URL)
}

async function testTunnelConnectivity() {
  try {
    console.log('\n🌐 Testing tunnel connectivity...')
    const response = await fetch(`${API_BASE_URL}/api/health`)
    
    if (response.ok) {
      const data = await response.json()
      console.log('✅ Tunnel connectivity successful!')
      console.log('📊 Server status:', data.status)
      console.log('⏰ Server uptime:', Math.round(data.uptime), 'seconds')
    } else {
      console.log('❌ Tunnel connectivity failed:', response.status, response.statusText)
    }
  } catch (error) {
    console.log('❌ Tunnel connectivity error:', error.message)
  }
}

// Run the connectivity test if we're in a browser environment
if (typeof window !== 'undefined') {
  testTunnelConnectivity()
}

export { API_BASE_URL, endpoints }