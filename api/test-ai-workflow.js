import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the enhanced AI service directly
import { EnhancedAIService } from './src/lib/enhancedAIService.js';

console.log('🧪 Testing Direct AI Processing Workflow');
console.log('========================================');

// Load environment variables
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        if (line.trim() && !line.startsWith('#')) {
            const [key, value] = line.split('=', 2);
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        }
    });
}

// Test data similar to what would come from the workflow
const testJobData = {
    id: 'test-123',
    data: {
        fileId: 'test-file-123',
        fileName: 'test-po.pdf',
        fileType: 'pdf',
        contentForProcessing: `
PURCHASE ORDER #PO-2025-001
Date: January 10, 2025
Supplier: TestCorp Industries Inc.
Address: 123 Business Street, Commerce City, CA 90210

BILL TO:                    SHIP TO:
Our Company Ltd.           Our Company Ltd.
456 Company Ave           456 Company Ave
Business City, NY 10001   Business City, NY 10001

Item Description           Qty    Unit Price    Total
--------------------------------------------------
Widget Model A            10     $25.00        $250.00
Premium Widget B          5      $45.00        $225.00
Super Widget Deluxe       2      $100.00       $200.00

                          Subtotal:   $675.00
                          Tax (8.5%): $57.38
                          Shipping:   $25.00
                          
                          TOTAL:      $757.38

Terms: Net 30
PO Number: PO-2025-001
Approved by: John Manager
        `.trim()
    }
};

console.log('📋 Test job data prepared:');
console.log(`- File ID: ${testJobData.data.fileId}`);
console.log(`- File Name: ${testJobData.data.fileName}`);
console.log(`- File Type: ${testJobData.data.fileType}`);
console.log(`- Content Length: ${testJobData.data.contentForProcessing.length} characters`);

// Initialize AI service
const aiService = new EnhancedAIService();

try {
    console.log('\n🚀 Starting AI processing...');
    const startTime = Date.now();
    
    const result = await aiService.processContent(
        testJobData.data.contentForProcessing,
        testJobData.data.fileType,
        testJobData.data.fileName
    );
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ AI processing completed successfully in ${duration}ms`);
    console.log('\n📊 Results:');
    console.log('===========');
    
    if (result.success) {
        console.log('✅ Processing Status: SUCCESS');
        console.log(`📄 PO Number: ${result.data.poNumber || 'Not found'}`);
        console.log(`🏢 Supplier: ${result.data.supplier || 'Not found'}`);
        console.log(`📅 Date: ${result.data.date || 'Not found'}`);
        console.log(`💰 Total: ${result.data.total || 'Not found'}`);
        console.log(`📦 Items: ${result.data.items?.length || 0} items`);
        
        if (result.data.items && result.data.items.length > 0) {
            console.log('\n📋 Items Details:');
            result.data.items.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.description || 'Unknown'} - Qty: ${item.quantity || 'N/A'} - Price: ${item.unitPrice || 'N/A'}`);
            });
        }
        
        console.log('\n🔍 Full parsed data:');
        console.log(JSON.stringify(result.data, null, 2));
        
    } else {
        console.log('❌ Processing Status: FAILED');
        console.log(`❌ Error: ${result.error}`);
        if (result.details) {
            console.log('📝 Error Details:', result.details);
        }
    }
    
} catch (error) {
    console.error('🚨 Direct AI processing test failed:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.code) {
        console.error('Error Code:', error.code);
    }
    if (error.status) {
        console.error('Status:', error.status);
    }
    
    process.exit(1);
}

console.log('\n✅ Direct AI processing test completed!');