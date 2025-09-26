import { WorkflowOrchestrator } from './src/lib/workflowOrchestrator.js';

async function testWorkflowDatabaseSave() {
    console.log('🔍 Testing Database Save in Workflow Context...\n');
    
    try {
        const orchestrator = new WorkflowOrchestrator();
        await orchestrator.initialize();
        
        // Create mock job data similar to what would come from AI parsing
        const mockJobData = {
            workflowId: 'test-workflow-' + Date.now(),
            data: {
                aiResult: {
                    model: "gpt-4o-mini",
                    confidence: {
                        overall: 92,
                        lineItems: { overall: 88 }
                    },
                    extractedData: {
                        poNumber: "PO-WORKFLOW-TEST-" + Date.now(),
                        vendor: {
                            name: "Workflow Test Supplier",
                            email: "test@workflowsupplier.com"
                        },
                        supplierName: "Workflow Test Supplier",
                        orderDate: "2025-09-24",
                        dueDate: "2025-10-15",
                        totals: {
                            total: 2500.50
                        },
                        currency: "USD",
                        lineItems: [
                            {
                                itemName: "Workflow Test Item A",
                                quantity: 5,
                                unitPrice: 100.00,
                                totalPrice: 500.00,
                                sku: "WF-A-001"
                            },
                            {
                                itemName: "Workflow Test Item B", 
                                quantity: 10,
                                unitPrice: 200.05,
                                totalPrice: 2000.50,
                                sku: "WF-B-002"
                            }
                        ]
                    },
                    processingNotes: "Test processing for workflow debugging"
                },
                fileName: 'workflow-test.csv',
                uploadId: 'workflow-test-' + Date.now(),
                merchantId: 'cmft3moy50000ultcbqgxzz6d'
            }
        };
        
        // Create mock Bull job
        const mockJob = {
            data: mockJobData,
            progress: (percent) => console.log(`   📊 Progress: ${percent}%`)
        };
        
        console.log('🤖 Mock AI Data:');
        console.log('   Workflow ID:', mockJobData.workflowId);
        console.log('   PO Number:', mockJobData.data.aiResult.extractedData.poNumber);
        console.log('   Confidence:', mockJobData.data.aiResult.confidence.overall + '%');
        console.log('   Supplier:', mockJobData.data.aiResult.extractedData.vendor.name);
        console.log('   Total Amount:', mockJobData.data.aiResult.extractedData.totals.total);
        console.log('   Line Items:', mockJobData.data.aiResult.extractedData.lineItems.length);
        
        console.log('\n💾 Calling WorkflowOrchestrator.processDatabaseSave()...');
        
        const result = await orchestrator.processDatabaseSave(mockJob);
        
        console.log('\n✅ Workflow Database Save Result:');
        console.log('   Success:', result.success);
        console.log('   Stage:', result.stage);
        console.log('   Next Stage:', result.nextStage);
        console.log('   DB Result Success:', result.dbResult?.success);
        console.log('   Purchase Order ID:', result.dbResult?.purchaseOrder?.id);
        console.log('   Purchase Order Number:', result.dbResult?.purchaseOrder?.number);
        console.log('   Purchase Order Status:', result.dbResult?.purchaseOrder?.status);
        console.log('   Purchase Order Confidence:', result.dbResult?.purchaseOrder?.confidence);
        console.log('   Line Items:', result.dbResult?.lineItems?.length);
        
        if (!result.success || !result.dbResult?.success) {
            console.log('❌ Database save failed:');
            console.log('   Error:', result.dbResult?.error || result.error);
        }
        
        // Check workflow metadata
        const metadata = await orchestrator.getWorkflowMetadata(mockJobData.workflowId);
        console.log('\n📋 Workflow Metadata after database save:');
        console.log('   Current Stage:', metadata?.currentStage);
        console.log('   Progress:', metadata?.progress + '%');
        console.log('   Database Save Status:', metadata?.stages?.database_save?.status);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('   Stack:', error.stack);
    }
}

testWorkflowDatabaseSave();