/**
 * Check the status of the latest workflow from our server test
 */

import fetch from 'node-fetch';

async function checkLatestWorkflowStatus() {
  try {
    console.log('🔍 Checking latest workflow status...');
    
    // First, let's get the latest upload to find the workflow ID
    const uploadsResponse = await fetch('http://localhost:3005/api/purchase-orders?limit=5');
    
    if (!uploadsResponse.ok) {
      console.error('❌ Failed to get uploads');
      return;
    }
    
    const uploadsData = await uploadsResponse.json();
    const latestPO = uploadsData.data[0]; // Get the most recent one
    
    if (latestPO && latestPO.rawData && latestPO.rawData.metadata && latestPO.rawData.metadata.workflowId) {
      const workflowId = latestPO.rawData.metadata.workflowId;
      console.log(`🔍 Found workflow ID: ${workflowId}`);
      
      // Get the upload ID (it's in the PO ID format or we need to construct it)
      // For now, let's try to get status using what we know
      console.log('📋 Latest PO:', JSON.stringify({
        id: latestPO.id,
        number: latestPO.number,
        fileName: latestPO.fileName,
        status: latestPO.status,
        workflowId: workflowId
      }, null, 2));
      
    } else {
      console.log('📋 Latest PO (no workflow found):', JSON.stringify({
        id: latestPO?.id,
        number: latestPO?.number,
        fileName: latestPO?.fileName,
        status: latestPO?.status,
        hasRawData: !!latestPO?.rawData
      }, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error checking workflow status:', error.message);
  }
}

checkLatestWorkflowStatus();