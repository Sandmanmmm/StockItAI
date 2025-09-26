/**
 * Test AI processing with mock data
 */

async function testAIProcessing() {
    console.log('🧪 Testing AI processing logic...');
    
    try {
        // Test the import
        console.log('📦 Testing imports...');
        const { enhancedAIService } = await import('./src/lib/enhancedAIService.js');
        console.log('✅ enhancedAIService imported successfully');
        
        // Check if parseDocument method exists
        if (typeof enhancedAIService.parseDocument === 'function') {
            console.log('✅ parseDocument method exists');
        } else {
            console.log('❌ parseDocument method missing');
            return;
        }
        
        // Test with mock data
        console.log('🧪 Testing parseDocument with mock data...');
        
        const mockContent = Buffer.from('Test PO content\nItem: Widget\nPrice: $10.00\nQuantity: 5');
        const mockWorkflowId = 'test_workflow_123';
        const mockOptions = {
            confidenceThreshold: 0.8
        };
        
        console.log('📋 Mock data prepared:', {
            contentLength: mockContent.length,
            workflowId: mockWorkflowId,
            options: mockOptions
        });
        
        // Try to call parseDocument
        try {
            const result = await enhancedAIService.parseDocument(mockContent, mockWorkflowId, mockOptions);
            console.log('✅ AI parsing succeeded:', result);
        } catch (aiError) {
            console.log('❌ AI parsing failed:', aiError.message);
            console.log('📋 Full AI error:', aiError);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('📋 Full error:', error.stack);
    }
}

testAIProcessing();