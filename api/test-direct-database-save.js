import path from 'path';
import { fileURLToPath } from 'url';
import { WorkflowOrchestrator } from './src/lib/workflowOrchestrator.js';
import { DatabasePersistenceService } from './src/lib/databasePersistenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testDatabaseSaveDirectly() {
    console.log('🔍 Testing Database Save Directly...\n');
    
    try {
        const dbService = new DatabasePersistenceService();
        
        // Create mock AI result with realistic data
        const mockAIResult = {
            model: "gpt-4",
            confidence: {
                overall: 92,
                lineItems: { overall: 88 }
            },
            extractedData: {
                poNumber: "PO-TEST-123456",
                vendor: {
                    name: "Test Supplier Co",
                    email: "orders@testsupplier.com"
                },
                supplierName: "Test Supplier Co",
                orderDate: "2025-09-24",
                dueDate: "2025-10-15",
                totals: {
                    total: 1250.75
                },
                currency: "USD",
                lineItems: [
                    {
                        itemName: "Test Product A",
                        quantity: 10,
                        unitPrice: 50.00,
                        totalPrice: 500.00,
                        sku: "TST-A-001"
                    },
                    {
                        itemName: "Test Product B", 
                        quantity: 15,
                        unitPrice: 45.50,
                        totalPrice: 682.50,
                        sku: "TST-B-002"
                    }
                ]
            },
            processingNotes: "Test processing for debugging"
        };
        
        console.log('🤖 Mock AI Result:');
        console.log('   Confidence:', mockAIResult.confidence.overall + '%');
        console.log('   PO Number:', mockAIResult.extractedData.poNumber);
        console.log('   Supplier:', mockAIResult.extractedData.vendor.name);
        console.log('   Total Amount:', mockAIResult.extractedData.totals.total);
        console.log('   Line Items:', mockAIResult.extractedData.lineItems.length);
        
        console.log('\n💾 Testing direct database persistence...');
        
        const result = await dbService.persistAIResults(
            mockAIResult,
            'cmft3moy50000ultcbqgxzz6d', // Test merchant ID
            'test-direct-save.pdf',
            {
                uploadId: 'test-direct-' + Date.now(),
                workflowId: 'test-workflow-' + Date.now(),
                source: 'direct_test'
            }
        );
        
        console.log('\n✅ Database persistence result:');
        console.log('   Success:', result.success);
        console.log('   PO ID:', result.purchaseOrder?.id);
        console.log('   PO Number:', result.purchaseOrder?.number);
        console.log('   PO Status:', result.purchaseOrder?.status);
        console.log('   PO Confidence:', result.purchaseOrder?.confidence);
        console.log('   PO Total Amount:', result.purchaseOrder?.totalAmount);
        console.log('   Supplier:', result.supplier?.name);
        console.log('   Line Items:', result.lineItems?.length);
        console.log('   Processing Time:', result.processingTime + 'ms');
        
        if (!result.success) {
            console.log('❌ Error:', result.error);
        }
        
        if (result.purchaseOrder?.id) {
            console.log('\n🔍 Verifying database record...');
            
            // Query the database directly to verify the record was saved
            const savedPO = await dbService.prisma.purchaseOrder.findUnique({
                where: { id: result.purchaseOrder.id },
                include: {
                    lineItems: true,
                    supplier: true
                }
            });
            
            console.log('\n📋 Verified Database Record:');
            console.log('   ID:', savedPO?.id);
            console.log('   Number:', savedPO?.number);
            console.log('   Status:', savedPO?.status);
            console.log('   Confidence:', savedPO?.confidence);
            console.log('   Total Amount:', savedPO?.totalAmount);
            console.log('   Supplier Name:', savedPO?.supplierName);
            console.log('   Line Items Count:', savedPO?.lineItems?.length);
            console.log('   Raw Data Present:', !!savedPO?.rawData);
            
            if (savedPO?.lineItems && savedPO.lineItems.length > 0) {
                console.log('\n📦 Line Items Details:');
                savedPO.lineItems.forEach((item, index) => {
                    console.log(`   ${index + 1}. ${item.itemName} - Qty: ${item.quantity}, Price: $${item.unitPrice}, Total: $${item.totalPrice}`);
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('   Stack:', error.stack);
    }
}

testDatabaseSaveDirectly();