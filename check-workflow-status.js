import fetch from 'node-fetch';

async function checkWorkflowStatus() {
    const workflowId = 'workflow_1758776231817_7ritphy2o';
    const uploadId = 'cmfyxyheo000p55g0ypx32tqi';
    
    console.log(`🔍 Checking workflow status: ${workflowId}`);
    console.log(`📤 Associated upload: ${uploadId}`);
    
    try {
        // Try to get workflow status from API
        const response = await fetch(`http://localhost:3005/api/upload/${uploadId}/workflow-status`);
        
        if (response.ok) {
            const data = await response.json();
            console.log('\n📊 Workflow Status Response:');
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log(`❌ Failed to get workflow status: ${response.status}`);
            const error = await response.text();
            console.log(`Error: ${error}`);
        }
        
    } catch (error) {
        console.log(`❌ Error checking workflow: ${error.message}`);
    }
    
    // Also try to manually trigger processing for this stuck PO
    console.log('\n🔧 POTENTIAL SOLUTION:');
    console.log('The workflow seems to be stuck during PDF processing.');
    console.log('This could be due to:');
    console.log('1. PDF file format not supported by AI parsing');
    console.log('2. Large file size (3.8MB) causing timeouts');
    console.log('3. Queue processing issues with PDF files');
    console.log('4. Missing PDF processing dependencies');
    
    console.log('\n🎯 QUICK FIX OPTIONS:');
    console.log('1. Try reprocessing the stuck PO manually');
    console.log('2. Check if AI service supports PDF files');
    console.log('3. Add PDF-specific error handling');
    console.log('4. Implement file type validation before workflow start');
}

checkWorkflowStatus();