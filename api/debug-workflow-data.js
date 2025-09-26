import { WorkflowOrchestrator } from './src/lib/workflowOrchestrator.js';

async function debugWorkflowData() {
    console.log('🔍 Debugging Workflow Data Flow...\n');
    
    try {
        const orchestrator = new WorkflowOrchestrator();
        await orchestrator.initialize();
        
        // Use the most recent PO ID from our test
        const testPOId = 'cmfywps8y000155jcaxuh8625';
        const workflowId = 'workflow_1758774147105_kgdo3olbe';
        
        console.log('📋 Checking workflow metadata...');
        const metadata = await orchestrator.getWorkflowMetadata(workflowId);
        
        if (metadata) {
            console.log('✅ Workflow metadata found:');
            console.log('   Workflow ID:', metadata.workflowId);
            console.log('   Status:', metadata.status);
            console.log('   Current Stage:', metadata.currentStage);
            console.log('   Progress:', metadata.progress + '%');
            console.log('   Data Keys:', Object.keys(metadata.data || {}));
            
            if (metadata.data) {
                console.log('\n📊 Workflow Data:');
                console.log('   Purchase Order ID:', metadata.data.purchaseOrderId);
                console.log('   Upload ID:', metadata.data.uploadId);
                console.log('   File Name:', metadata.data.fileName);
                console.log('   Merchant ID:', metadata.data.merchantId);
                console.log('   Supplier ID:', metadata.data.supplierId);
            }
            
            console.log('\n🔍 Stage Details:');
            Object.entries(metadata.stages || {}).forEach(([stage, info]) => {
                console.log(`   ${stage}:`, info.status, info.updatedAt ? `(${info.updatedAt})` : '');
            });
            
        } else {
            console.log('❌ No workflow metadata found for', workflowId);
        }
        
        // Now test if we can find the PO record
        const dbService = orchestrator.dbService;
        const po = await dbService.prisma.purchaseOrder.findUnique({
            where: { id: testPOId }
        });
        
        console.log('\n📋 Current PO Record State:');
        console.log('   ID:', po?.id);
        console.log('   Status:', po?.status);
        console.log('   Job Status:', po?.jobStatus);
        console.log('   Confidence:', po?.confidence);
        console.log('   Total Amount:', po?.totalAmount);
        console.log('   Supplier Name:', po?.supplierName);
        console.log('   Updated At:', po?.updatedAt);
        
        // Try to manually update this PO with mock data to test the update logic
        console.log('\n🧪 Testing manual PO update...');
        try {
            const updatedPO = await dbService.prisma.purchaseOrder.update({
                where: { id: testPOId },
                data: {
                    status: 'completed',
                    jobStatus: 'completed',
                    confidence: 0.92,
                    totalAmount: 999.99,
                    supplierName: 'Manual Test Update',
                    processingNotes: 'Manually updated for debugging',
                    updatedAt: new Date()
                }
            });
            
            console.log('✅ Manual update successful:');
            console.log('   New Status:', updatedPO.status);
            console.log('   New Job Status:', updatedPO.jobStatus);
            console.log('   New Confidence:', updatedPO.confidence);
            console.log('   New Total:', updatedPO.totalAmount);
            console.log('   New Supplier:', updatedPO.supplierName);
            
        } catch (updateError) {
            console.log('❌ Manual update failed:', updateError.message);
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
        console.error('   Stack:', error.stack);
    }
}

debugWorkflowData();