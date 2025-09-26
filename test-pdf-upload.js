import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

async function testPDFUploadAndWorkflow() {
    console.log('🧪 Testing PDF upload and automatic workflow processing...');
    
    try {
        // Check if server is ready
        const healthResponse = await fetch('http://localhost:3005/api/health');
        if (!healthResponse.ok) {
            console.log('❌ Server not ready yet. Please wait for the API server to fully initialize.');
            return;
        }
        
        console.log('✅ Server is ready');
        
        // Create a simple test PDF (we'll use a text file with PDF extension for testing)
        // In a real scenario, you'd have an actual PDF file
        const testPDFContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Test Purchase Order) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000053 00000 n 
0000000110 00000 n 
0000000181 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
275
%%EOF`;
        
        // Write to a temporary PDF file
        const testFileName = `test-po-${Date.now()}.pdf`;
        fs.writeFileSync(testFileName, testPDFContent);
        
        console.log(`📄 Created test PDF file: ${testFileName}`);
        
        // Upload the PDF file
        const formData = new FormData();
        formData.append('file', fs.createReadStream(testFileName), {
            filename: testFileName,
            contentType: 'application/pdf'
        });
        
        console.log('📤 Uploading test PDF file...');
        const uploadResponse = await fetch('http://localhost:3005/api/upload/po-file', {
            method: 'POST',
            body: formData
        });
        
        const result = await uploadResponse.json();
        
        if (uploadResponse.ok) {
            console.log('✅ PDF upload successful!');
            console.log('📝 Upload Response:', JSON.stringify(result, null, 2));
            
            if (result.data && result.data.workflowId) {
                console.log(`🎯 Workflow started: ${result.data.workflowId}`);
                console.log('👀 Check the API server window for detailed debug logs...');
                console.log('🔍 Look for PDF parsing in the workflow orchestration:');
                console.log('   - 📄 PDF file parsing with FileParsingService');
                console.log('   - 🤖 AI parsing stage with extracted text');
                console.log('   - 💾 Database save stage completion');
                console.log('   - ✅ Status update with confidence and supplier info');
                
                // Monitor workflow progress by checking PO status
                let attempts = 0;
                const maxAttempts = 15;
                const poId = result.data.poId;
                
                console.log('\n📊 Monitoring workflow progress...');
                
                while (attempts < maxAttempts) {
                    try {
                        const statusResponse = await fetch(`http://localhost:3005/api/pos/${poId}/status`);
                        if (statusResponse.ok) {
                            const statusData = await statusResponse.json();
                            console.log(`   Attempt ${attempts + 1}: Status = ${statusData.status}, Confidence = ${statusData.confidence || 0}%`);
                            
                            if (statusData.status === 'review_needed' || statusData.status === 'completed') {
                                console.log('🎉 PDF processing completed successfully!');
                                console.log('📊 Final Results:');
                                console.log(`   Status: ${statusData.status}`);
                                console.log(`   Confidence: ${statusData.confidence}%`);
                                console.log(`   Supplier: ${statusData.supplierName || 'Not extracted'}`);
                                console.log(`   Total: ${statusData.totalAmount || 'Not calculated'}`);
                                break;
                            } else if (statusData.status === 'failed') {
                                console.log('❌ PDF processing failed!');
                                console.log(`   Error: ${statusData.jobError || 'Unknown error'}`);
                                break;
                            }
                        }
                    } catch (statusError) {
                        console.log(`   Status check ${attempts + 1} failed:`, statusError.message);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
                    attempts++;
                }
                
                if (attempts >= maxAttempts) {
                    console.log('⏰ Workflow monitoring timeout - check server logs for final status');
                }
                
            } else {
                console.log('❌ No workflow ID returned - workflow may not have started');
            }
        } else {
            console.error('❌ PDF upload failed!');
            console.error('📝 Error Response:', JSON.stringify(result, null, 2));
            
            if (result.error) {
                console.error('🔍 Error details:', result.error);
            }
        }
        
        // Clean up test file
        try {
            fs.unlinkSync(testFileName);
            console.log(`🧹 Cleaned up test file: ${testFileName}`);
        } catch (cleanupError) {
            console.log(`⚠️ Could not clean up test file: ${cleanupError.message}`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('🔍 Full error details:', error.message);
    }
}

// Run the test
testPDFUploadAndWorkflow();