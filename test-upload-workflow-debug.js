import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

async function testUploadAndWorkflow() {
    console.log('🧪 Testing upload and workflow with debug logging...');
    
    try {
        // Check if server is ready
        const healthResponse = await fetch('http://localhost:3005/api/health');
        if (!healthResponse.ok) {
            console.log('❌ Server not ready yet. Please wait for the API server to fully initialize.');
            return;
        }
        
        console.log('✅ Server is ready');
        
        // Create a simple test CSV content
        const csvContent = `PO Number,Supplier,Item,Quantity,Unit Price,Total
PO-TEST-${Date.now()},Test Supplier Inc,Widget A,5,10.00,50.00
PO-TEST-${Date.now()},Test Supplier Inc,Widget B,3,15.00,45.00`;
        
        // Write to a temporary file
        const testFileName = `test-po-${Date.now()}.csv`;
        fs.writeFileSync(testFileName, csvContent);
        
        console.log(`📄 Created test file: ${testFileName}`);
        
        // Upload the file
        const formData = new FormData();
        formData.append('file', fs.createReadStream(testFileName), testFileName);
        
        console.log('📤 Uploading test file...');
        const uploadResponse = await fetch('http://localhost:3005/api/upload/po-file', {
            method: 'POST',
            body: formData
        });
        
        if (uploadResponse.ok) {
            const result = await uploadResponse.json();
            console.log('✅ Upload successful!');
            console.log('📝 Upload Response:', JSON.stringify(result, null, 2));
            
            if (result.purchaseOrder && result.purchaseOrder.id) {
                console.log(`🎯 New PO created: ${result.purchaseOrder.id}`);
                console.log('👀 Check the API server window for detailed debug logs...');
                console.log('🔍 Look for debug messages in the workflow orchestration:');
                console.log('   - ✅ AI parsing stage completion');
                console.log('   - ✅ Database save stage with purchaseOrderId validation');
                console.log('   - ✅ Status update stage with database update attempts');
                console.log('   - ❌ Any errors or timing discrepancies');
                
                // Monitor the PO for a few seconds
                console.log('\\n⏰ Monitoring PO progress...');
                for (let i = 0; i < 10; i++) {
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                    
                    const poResponse = await fetch(`http://localhost:3005/api/purchase-orders/${result.purchaseOrder.id}`);
                    if (poResponse.ok) {
                        const poData = await poResponse.json();
                        if (poData.success && poData.data) {
                            console.log(`📊 [${i*2}s] Status: ${poData.data.status}, Confidence: ${poData.data.confidence}%`);
                            
                            if (poData.data.status === 'completed') {
                                console.log('✅ Workflow completed successfully!');
                                break;
                            }
                        }
                    }
                }
            }
            
        } else {
            console.log('❌ Upload failed');
            console.log('Status:', uploadResponse.status);
            const error = await uploadResponse.text();
            console.log('Error:', error);
        }
        
        // Clean up test file
        if (fs.existsSync(testFileName)) {
            fs.unlinkSync(testFileName);
            console.log(`🧹 Cleaned up test file: ${testFileName}`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testUploadAndWorkflow();