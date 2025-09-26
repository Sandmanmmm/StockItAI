/**
 * Test the fixed AI parsing logic with CSV file
 */

async function testFixedAIParsing() {
    console.log('🧪 Testing fixed AI parsing logic...');
    
    try {
        // Test fileParsingService import
        console.log('📦 Testing fileParsingService import...');
        try {
            const { fileParsingService } = await import('./src/lib/fileParsingService.js');
            console.log('✅ fileParsingService imported successfully');
            
            if (typeof fileParsingService.parseFile === 'function') {
                console.log('✅ parseFile method exists');
            } else {
                console.log('❌ parseFile method missing');
            }
        } catch (importError) {
            console.log('❌ fileParsingService import failed:', importError.message);
        }
        
        // Test the logic with mock CSV data
        console.log('\n🧪 Testing file type detection logic...');
        const mockFileName = 'test-job.csv';
        const fileExtension = mockFileName.split('.').pop().toLowerCase();
        console.log(`📄 File extension: ${fileExtension}`);
        console.log(`📊 Should use structured parsing: ${['csv', 'xlsx', 'xls'].includes(fileExtension)}`);
        
        // Test with mock CSV content
        const mockCSVContent = Buffer.from('Item,Price,Quantity\nWidget,$10.00,5\nGadget,$15.00,3');
        console.log('📋 Mock CSV content prepared:', mockCSVContent.length, 'bytes');
        
        // Try the parsing logic
        try {
            const { fileParsingService } = await import('./src/lib/fileParsingService.js');
            
            const parsingResult = await fileParsingService.parseFile(mockCSVContent, 'text/csv', mockFileName);
            
            console.log('✅ File parsing succeeded:', parsingResult);
        } catch (parseError) {
            console.log('❌ File parsing failed:', parseError.message);
            console.log('📋 Full error:', parseError);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testFixedAIParsing();