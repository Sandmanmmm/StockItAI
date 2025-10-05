/**
 * Vercel Deployment Verification Script
 * 
 * Run this after deploying to Vercel to verify everything is working correctly.
 * 
 * Usage:
 *   node verify-vercel-deployment.js https://your-vercel-app.vercel.app
 */

const https = require('https');

const BASE_URL = process.argv[2];

if (!BASE_URL) {
  console.error('❌ Error: Please provide your Vercel deployment URL');
  console.log('Usage: node verify-vercel-deployment.js https://your-vercel-app.vercel.app');
  process.exit(1);
}

const tests = [];
let passed = 0;
let failed = 0;

/**
 * Make HTTP request
 */
function makeRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'User-Agent': 'Vercel-Deployment-Verification',
      }
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

/**
 * Run a test
 */
async function runTest(name, testFn) {
  process.stdout.write(`  Testing: ${name}... `);
  try {
    await testFn();
    console.log('✅ PASSED');
    passed++;
    return true;
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    failed++;
    return false;
  }
}

/**
 * Main verification
 */
async function verify() {
  console.log('🚀 Vercel Deployment Verification\n');
  console.log(`Target: ${BASE_URL}\n`);

  console.log('📋 Running Tests...\n');

  // Test 1: Homepage accessible
  await runTest('Homepage accessible', async () => {
    const response = await makeRequest(BASE_URL);
    if (response.statusCode !== 200) {
      throw new Error(`Expected 200, got ${response.statusCode}`);
    }
  });

  // Test 2: API health endpoint
  await runTest('API health check', async () => {
    const response = await makeRequest(`${BASE_URL}/api/health`);
    if (response.statusCode !== 200) {
      throw new Error(`Expected 200, got ${response.statusCode}`);
    }
    const data = JSON.parse(response.body);
    if (!data.status || data.status !== 'ok') {
      throw new Error('Health check returned unexpected status');
    }
  });

  // Test 3: Webhook health endpoint
  await runTest('Webhook health check', async () => {
    const response = await makeRequest(`${BASE_URL}/api/webhooks/health`);
    if (response.statusCode !== 200) {
      throw new Error(`Expected 200, got ${response.statusCode}`);
    }
  });

  // Test 4: OAuth callback endpoint exists
  await runTest('OAuth callback endpoint', async () => {
    const response = await makeRequest(`${BASE_URL}/api/auth/callback`);
    // Should return 400 (missing required params) not 404
    if (response.statusCode === 404) {
      throw new Error('OAuth endpoint not found');
    }
  });

  // Test 5: Frontend static assets
  await runTest('Frontend assets loading', async () => {
    const response = await makeRequest(BASE_URL);
    if (!response.body.includes('root')) {
      throw new Error('HTML does not contain root element');
    }
  });

  // Test 6: CORS headers
  await runTest('CORS headers configured', async () => {
    const response = await makeRequest(`${BASE_URL}/api/health`);
    if (!response.headers['access-control-allow-origin']) {
      throw new Error('CORS headers not set');
    }
  });

  // Test 7: Check webhook endpoints exist
  const webhookEndpoints = [
    '/api/webhooks/orders/created',
    '/api/webhooks/orders/updated',
    '/api/webhooks/products/create',
    '/api/webhooks/app/uninstalled'
  ];

  for (const endpoint of webhookEndpoints) {
    await runTest(`Webhook endpoint: ${endpoint}`, async () => {
      const response = await makeRequest(`${BASE_URL}${endpoint}`, 'POST', {});
      // Should return 401 (unauthorized) or 400 (bad request), not 404
      if (response.statusCode === 404) {
        throw new Error('Webhook endpoint not found');
      }
    });
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total:  ${passed + failed}`);
  console.log(`🎯 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  console.log('='.repeat(50));

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Your deployment looks good!');
    console.log('\n📋 Next Steps:');
    console.log('1. Update Shopify app URLs in Partner Dashboard');
    console.log('2. Configure all environment variables in Vercel');
    console.log('3. Install app on a test store');
    console.log('4. Verify webhooks are registered in Shopify Admin');
    console.log('5. Test core functionality (PO upload, AI processing, Shopify sync)');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Please check the errors above.`);
    console.log('\n🔍 Troubleshooting:');
    console.log('1. Check Vercel deployment logs');
    console.log('2. Verify all environment variables are set');
    console.log('3. Ensure build completed successfully');
    console.log('4. Check function logs for errors');
  }

  console.log('\n📚 Documentation:');
  console.log('- VERCEL_DEPLOYMENT_NEXT_STEPS.md');
  console.log('- WEBHOOK_DEPLOYMENT_STATUS.md');
  console.log('- DEPLOYMENT_CHECKLIST.md');
  console.log('');
}

// Run verification
verify().catch(error => {
  console.error('\n❌ Fatal Error:', error.message);
  process.exit(1);
});
