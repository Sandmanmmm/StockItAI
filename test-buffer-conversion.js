// Test file buffer conversion fix
import fs from 'fs';
import fileParsingService from './api/src/lib/fileParsingService.js';

// Read the test PDF as it would be stored in queue data
const testPdfPath = './test-po-1758777151697.pdf';
const fileBuffer = fs.readFileSync(testPdfPath);

console.log('Original file buffer:', fileBuffer.constructor.name, 'Length:', fileBuffer.length);

// Convert to array like queue data does
const arrayBuffer = Array.from(fileBuffer);
console.log('Array buffer:', arrayBuffer.constructor.name, 'Length:', arrayBuffer.length);

// Convert back to Buffer like our fix does
const convertedBuffer = Buffer.from(arrayBuffer);
console.log('Converted buffer:', convertedBuffer.constructor.name, 'Length:', convertedBuffer.length);

// Test if they're equivalent
console.log('Buffers equivalent:', Buffer.compare(fileBuffer, convertedBuffer) === 0);

// Test FileParsingService with the converted buffer
try {
  const result = await fileParsingService.parseFile(convertedBuffer, 'application/pdf', 'test.pdf');
  console.log('✅ FileParsingService worked with converted buffer');
  console.log('Extracted text:', result.text);
} catch (error) {
  console.error('❌ FileParsingService failed:', error.message);
}