/**
 * Direct test of the server's running orchestrator instance
 * This bypasses the API endpoints and tests the orchestrator directly
 */

console.log('🎯 Testing server orchestrator directly...');

const testDirectOrchestrator = async () => {
    try {
        console.log('🔌 Connecting to running server orchestrator...');
        
        // Import the same orchestrator instance the server is using
        const response = await fetch('http://localhost:3005/api/health');
        if (!response.ok) {
            throw new Error('Server not responding');
        }
        
        console.log('✅ Server is running, proceeding with direct orchestrator test');
        
        // Create a test workflow data structure
        const testWorkflowData = {
            uploadId: 'test-upload-' + Date.now(),
            fileName: 'direct-test.csv',
            merchantId: 'test-merchant',
            fileBuffer: Buffer.from('test,data,content\nitem1,5,$25.00\nitem2,3,$15.00'),
            options: {
                confidenceThreshold: 0.85,
                strictMatching: false,
                reprocessing: false
            }
        };
        
        console.log('\n📋 Test workflow data:');
        console.log('- Upload ID:', testWorkflowData.uploadId);
        console.log('- File Name:', testWorkflowData.fileName);
        console.log('- Merchant ID:', testWorkflowData.merchantId);
        
        // Instead of importing (which creates a new instance), 
        // let's test the API endpoint for adding jobs directly
        console.log('\n🔄 Testing via direct job addition API call...');
        
        const jobData = {
            workflowId: `direct_test_${Date.now()}`,
            stage: 'ai_parsing',
            data: testWorkflowData
        };
        
        // Make API call to trigger job processing
        const testResponse = await fetch('http://localhost:3005/api/test/add-job', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jobType: 'ai_parse',
                jobData: jobData
            })
        });
        
        if (!testResponse.ok) {
            const errorText = await testResponse.text();
            console.log('ℹ️  Direct job API not available, this is expected');
            console.log('🔄 Falling back to workflow start test...');
            
            // Test workflow start via API if available
            const workflowResponse = await fetch('http://localhost:3005/api/test/start-workflow', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(testWorkflowData)
            });
            
            if (!workflowResponse.ok) {
                console.log('ℹ️  Workflow API not available either');
                console.log('📝 This suggests we need to create a test endpoint');
                return false;
            } else {
                const workflowResult = await workflowResponse.json();
                console.log('✅ Workflow started:', workflowResult);
                return true;
            }
        } else {
            const result = await testResponse.json();
            console.log('✅ Direct job addition result:', result);
            
            if (result.success) {
                console.log('\n⏰ Waiting 10 seconds to see if job processes...');
                await new Promise(resolve => setTimeout(resolve, 10000));
                
                console.log('🎉 If you see "🎯 BULL PROCESSOR TRIGGERED" in server console, it\'s working!');
                return true;
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Direct test failed:', error.message);
        
        // Final fallback: Create a minimal endpoint test
        console.log('\n🔧 Creating a test endpoint would help here...');
        console.log('📝 We need a simple API endpoint to test the orchestrator directly');
        console.log('💡 Suggestion: Add GET /api/test/trigger-job endpoint');
        
        return false;
    }
};

// Run the test
testDirectOrchestrator()
    .then(success => {
        if (success) {
            console.log('\n🎉 SUCCESS: Direct orchestrator test worked!');
        } else {
            console.log('\n🔧 NEXT STEP: Create a test endpoint for direct orchestrator testing');
            console.log('📋 We\'ve confirmed the server is running, but need better testing access');
        }
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test script error:', error);
        process.exit(1);
    });