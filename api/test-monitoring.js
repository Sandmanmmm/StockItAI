/**
 * Test Monitoring Dashboard Endpoints
 * Verify the production monitoring functionality
 */

console.log('🔍 Testing Monitoring Dashboard Endpoints...')

const BASE_URL = 'http://localhost:3003'

async function testEndpoint(path, description) {
  try {
    console.log(`\n📊 Testing ${description}...`)
    const response = await fetch(`${BASE_URL}${path}`)
    
    if (!response.ok) {
      console.log(`❌ ${description} failed: ${response.status} ${response.statusText}`)
      return false
    }
    
    const data = await response.json()
    console.log(`✅ ${description} success:`)
    
    if (path.includes('dashboard')) {
      console.log('  - Overall status:', data.data?.status?.overall)
      console.log('  - Queue waiting:', data.data?.queues?.main?.waiting)
      console.log('  - Queue active:', data.data?.queues?.main?.active)
      console.log('  - Alerts:', data.data?.alerts?.length || 0)
    } else if (path.includes('health')) {
      console.log('  - Health status:', data.data?.status)
      console.log('  - Redis check:', data.data?.checks?.redis)
      console.log('  - Queue check:', data.data?.checks?.queues)
    } else if (path.includes('live')) {
      console.log('  - Live metrics:', Object.keys(data.data || {}).join(', '))
    }
    
    return true
  } catch (error) {
    console.log(`❌ ${description} error:`, error.message)
    return false
  }
}

async function testMonitoring() {
  const tests = [
    ['/api/monitoring/health', 'Health Check'],
    ['/api/monitoring/metrics/live', 'Live Metrics'],  
    ['/api/monitoring/dashboard', 'Full Dashboard'],
    ['/api/monitoring/trends', 'Trends Analysis']
  ]
  
  let passed = 0
  let total = tests.length
  
  for (const [path, description] of tests) {
    const success = await testEndpoint(path, description)
    if (success) passed++
  }
  
  console.log(`\n📈 Test Results: ${passed}/${total} endpoints passed`)
  
  if (passed === total) {
    console.log('🎉 All monitoring endpoints are working!')
    console.log('\n🌐 Access the dashboard at:')
    console.log('   http://localhost:3003/monitoring-dashboard.html')
  } else {
    console.log('⚠️  Some endpoints failed. Check server logs.')
  }
}

// Run the test
testMonitoring().catch(console.error)