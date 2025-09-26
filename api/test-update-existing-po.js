import { WorkflowOrchestrator } from './src/lib/workflowOrchestrator.js';

async function testDatabaseSaveWithExistingPO() {
    console.log('🔍 Testing Database Save with Existing PO...\n');
    
    try {
        const orchestrator = new WorkflowOrchestrator();
        await orchestrator.initialize();
        
        // Use the PO that we know exists but wasn't updated
        const existingPOId = 'cmfywps8y000155jcaxuh8625';
        
        console.log(`📋 Testing update of existing PO: ${existingPOId}`);
        
        // Create mock job data for the database save stage
        const mockJobData = {
            workflowId: 'test-update-' + Date.now(),
            data: {
                aiResult: {
                    model: "gpt-4o-mini",
                    confidence: {
                        overall: 95,
                        lineItems: { overall: 90 }
                    },
                    extractedData: {
                        poNumber: "PO-UPDATE-TEST-" + Date.now(),
                        vendor: {
                            name: "Update Test Supplier",
                            email: "test@updatetest.com"
                        },
                        supplierName: "Update Test Supplier",
                        orderDate: "2025-09-25",
                        dueDate: "2025-10-20",
                        totals: {
                            total: 1500.00
                        },
                        currency: "USD",
                        lineItems: [
                            {
                                itemName: "Update Test Item A",
                                quantity: 3,
                                unitPrice: 250.00,
                                totalPrice: 750.00,
                                sku: "UP-A-001"
                            },
                            {
                                itemName: "Update Test Item B", 
                                quantity: 5,
                                unitPrice: 150.00,
                                totalPrice: 750.00,
                                sku: "UP-B-002"
                            }
                        ]
                    },
                    processingNotes: "Update test processing"
                },
                fileName: 'test-po.csv',
                uploadId: 'update-test-' + Date.now(),
                merchantId: 'cmft3moy50000ultcbqgxzz6d',
                purchaseOrderId: existingPOId // This is the key - pass the existing PO ID
            }
        };
        
        // Create mock Bull job
        const mockJob = {
            data: mockJobData,
            progress: (percent) => console.log(`   📊 Progress: ${percent}%`)
        };
        
        console.log('🤖 Test Data:');
        console.log('   Existing PO ID:', existingPOId);
        console.log('   AI Confidence:', mockJobData.data.aiResult.confidence.overall + '%');
        console.log('   Expected Supplier:', mockJobData.data.aiResult.extractedData.vendor.name);
        console.log('   Expected Total:', mockJobData.data.aiResult.extractedData.totals.total);
        
        // Get current PO state
        console.log('\n📋 BEFORE - Current PO State:');
        const beforePO = await orchestrator.dbService.prisma.purchaseOrder.findUnique({
            where: { id: existingPOId }
        });
        console.log('   Status:', beforePO?.status);
        console.log('   Confidence:', beforePO?.confidence);
        console.log('   Total Amount:', beforePO?.totalAmount);
        console.log('   Supplier Name:', beforePO?.supplierName);
        
        console.log('\n💾 Calling processDatabaseSave...');
        
        try {
            const result = await orchestrator.processDatabaseSave(mockJob);
            
            console.log('\n✅ Database Save Result:');
            console.log('   Success:', result?.success);
            console.log('   DB Result Success:', result?.dbResult?.success);
            console.log('   PO ID:', result?.dbResult?.purchaseOrder?.id);
            console.log('   PO Status:', result?.dbResult?.purchaseOrder?.status);
            console.log('   PO Confidence:', result?.dbResult?.purchaseOrder?.confidence);
            
        } catch (dbError) {
            console.log('\n❌ Database Save Error:');
            console.log('   Message:', dbError.message);
            console.log('   Stack:', dbError.stack);
        }
        
        // Get updated PO state
        console.log('\n📋 AFTER - Updated PO State:');
        const afterPO = await orchestrator.dbService.prisma.purchaseOrder.findUnique({
            where: { id: existingPOId }
        });
        console.log('   Status:', afterPO?.status);
        console.log('   Confidence:', afterPO?.confidence);
        console.log('   Total Amount:', afterPO?.totalAmount);
        console.log('   Supplier Name:', afterPO?.supplierName);
        console.log('   Updated At:', afterPO?.updatedAt);
        
        // Check if it actually changed
        const wasUpdated = (
            beforePO?.status !== afterPO?.status ||
            beforePO?.confidence !== afterPO?.confidence ||
            beforePO?.totalAmount !== afterPO?.totalAmount ||
            beforePO?.supplierName !== afterPO?.supplierName
        );
        
        console.log('\n🔍 Update Check:');
        console.log('   Was Actually Updated:', wasUpdated ? '✅ YES' : '❌ NO');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('   Stack:', error.stack);
    }
}

testDatabaseSaveWithExistingPO();