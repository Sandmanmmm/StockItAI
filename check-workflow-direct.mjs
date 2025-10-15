// Direct database query to check workflow
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkWorkflow() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        we.*, 
        po."poNumber",
        po.status as po_status,
        po."jobStatus",
        (SELECT COUNT(*) FROM "POLineItem" WHERE "purchaseOrderId" = po.id) as line_item_count
      FROM "WorkflowExecution" we
      LEFT JOIN "PurchaseOrder" po ON po.id = we."purchaseOrderId"
      WHERE we."workflowId" = 'wf_1760457694989_cmgqr22u'
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ Workflow not found');
      return;
    }
    
    const workflow = result.rows[0];
    console.log('\n🔍 Workflow Details:');
    console.log('==================');
    console.log(`Workflow ID: ${workflow.workflowId}`);
    console.log(`Status: ${workflow.status}`);
    console.log(`Stage: ${workflow.currentStage}`);
    console.log(`Progress: ${workflow.progress}%`);
    console.log(`Created: ${workflow.createdAt}`);
    console.log(`Updated: ${workflow.lastUpdatedAt}`);
    console.log(`Error: ${workflow.error || 'None'}`);
    console.log(`\nPO Number: ${workflow.poNumber}`);
    console.log(`PO Status: ${workflow.po_status}`);
    console.log(`Job Status: ${workflow.jobStatus}`);
    console.log(`Line Items: ${workflow.line_item_count}`);
    
    if (workflow.stageErrors) {
      console.log(`\n📋 Stage Errors:`);
      console.log(JSON.stringify(workflow.stageErrors, null, 2));
    }
    
    if (workflow.metadata) {
      console.log(`\n📝 Metadata:`);
      console.log(JSON.stringify(workflow.metadata, null, 2));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

checkWorkflow().catch(console.error);
