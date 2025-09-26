import { WorkflowOrchestrator } from './src/lib/workflowOrchestrator.js';

async function checkLatestWorkflow() {
    console.log('🔍 Checking the latest workflow execution...\n');
    
    try {
        const orchestrator = new WorkflowOrchestrator();
        await orchestrator.initialize();
        
        const workflowId = 'workflow_1758774557724_geopjmooh';
        const poId = 'cmfywylab000155vwawjxx4o4';
        
        console.log(`📋 Checking workflow: ${workflowId}`);
        console.log(`📋 Associated PO: ${poId}`);
        
        // Get workflow metadata
        const metadata = await orchestrator.getWorkflowMetadata(workflowId);
        
        if (metadata) {
            console.log('\n✅ Workflow Metadata Found:');
            console.log('   Status:', metadata.status);
            console.log('   Progress:', metadata.progress + '%');
            console.log('   Purchase Order ID in data:', metadata.data?.purchaseOrderId);
            
            console.log('\n🔍 Stage Completion Times:');
            Object.entries(metadata.stages || {}).forEach(([stage, info]) => {
                if (info.updatedAt) {
                    console.log(`   ${stage}: ${info.status} at ${info.updatedAt}`);
                }
            });
            
        } else {
            console.log('❌ No workflow metadata found');
        }
        
        // Check the actual PO record
        console.log('\n📋 Checking PO Record:');
        const po = await orchestrator.dbService.prisma.purchaseOrder.findUnique({
            where: { id: poId }
        });
        
        if (po) {
            console.log('   Status:', po.status);
            console.log('   Job Status:', po.jobStatus);
            console.log('   Confidence:', po.confidence);
            console.log('   Total Amount:', po.totalAmount);
            console.log('   Supplier Name:', po.supplierName);
            console.log('   Raw Data Present:', !!po.rawData);
            console.log('   Created At:', po.createdAt);
            console.log('   Updated At:', po.updatedAt);
            
            // Check the time gap
            const created = new Date(po.createdAt);
            const updated = new Date(po.updatedAt);
            const timeDiff = (updated - created) / 1000;
            
            console.log('   Update Time Gap:', timeDiff + ' seconds');
            
            if (timeDiff < 5) {
                console.log('   ⚠️ PO was not significantly updated after creation');
            } else {
                console.log('   ✅ PO was updated after processing');
            }
            
        } else {
            console.log('   ❌ PO not found');
        }
        
    } catch (error) {
        console.error('❌ Check failed:', error.message);
    }
}

checkLatestWorkflow();