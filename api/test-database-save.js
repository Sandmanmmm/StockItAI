import path from 'path';
import { fileURLToPath } from 'url';
import { WorkflowOrchestrator } from './src/lib/workflowOrchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testDatabaseSave() {
    console.log('🔍 Testing Database Save Stage...\n');
    
    try {
        const orchestrator = new WorkflowOrchestrator();
        
        // Use the most recent workflow ID from uploads
        const workflowId = 'workflow_1758768143432_s9gay0j33'; // Most recent from uploads
        
        console.log(`📋 Checking workflow metadata for ${workflowId}...`);
        
        // Get workflow metadata
        const metadata = await orchestrator.getWorkflowMetadata(workflowId);
        console.log('\n📊 Workflow Metadata:');
        console.log(JSON.stringify(metadata, null, 2));
        
        if (!metadata) {
            console.log('❌ No workflow metadata found');
            return;
        }
        
        // Check if we have AI result stored
        if (metadata.result && metadata.result.aiResult) {
            console.log('\n🤖 AI Result found in metadata:');
            console.log('   Confidence:', metadata.result.aiResult.confidence?.overall + '%');
            console.log('   Extracted PO Number:', metadata.result.aiResult.extractedData?.poNumber);
            console.log('   Supplier:', metadata.result.aiResult.extractedData?.vendor?.name);
            console.log('   Total Amount:', metadata.result.aiResult.extractedData?.totals?.total);
            console.log('   Line Items:', metadata.result.aiResult.extractedData?.lineItems?.length);
            
            // Now let's manually test the database save
            console.log('\n💾 Testing manual database save...');
            
            const mockJob = {
                data: {
                    workflowId: workflowId,
                    data: {
                        aiResult: metadata.result.aiResult,
                        fileName: `${testPO}.pdf`,
                        uploadId: testPO,
                        merchantId: 'cmft3moy50000ultcbqgxzz6d'
                    }
                },
                progress: (percent) => console.log(`   Progress: ${percent}%`)
            };
            
            try {
                const dbResult = await orchestrator.processDatabaseSave(mockJob);
                console.log('\n✅ Database save result:');
                console.log(JSON.stringify(dbResult, null, 2));
                
            } catch (dbError) {
                console.log('\n❌ Database save failed:');
                console.log('   Error:', dbError.message);
                console.log('   Stack:', dbError.stack);
            }
            
        } else {
            console.log('\n❌ No AI result found in workflow metadata');
            console.log('   Available keys:', Object.keys(metadata.result || {}));
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('   Stack:', error.stack);
    }
}

testDatabaseSave();