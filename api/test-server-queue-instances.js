/**
 * Test using the server's actual queue instances
 * This should reveal if there's an instance or connection issue
 */

console.log('🔬 Testing server queue instances directly...');

const testServerQueues = async () => {
  try {
    // Test by making API calls and monitoring real queue behavior
    console.log('📡 Testing server queue behavior...');
    
    // First, get current queue status
    console.log('🔍 Getting initial queue status...');
    let response = await fetch('http://localhost:3005/api/test/queue-debug');
    let debug = await response.json();
    
    if (!debug.success) {
      throw new Error('Failed to get queue debug info');
    }
    
    console.log('📊 Initial state:');
    console.log(`- ai_parse queue: ${debug.debug.queues.ai_parse.waiting} waiting, ${debug.debug.queues.ai_parse.active} active`);
    
    // Add a job via API
    console.log('\n📋 Adding job via server API...');
    response = await fetch('http://localhost:3005/api/test/trigger-job');
    const jobResult = await response.json();
    
    if (!jobResult.success) {
      throw new Error('Failed to add job via API');
    }
    
    console.log(`✅ Job ${jobResult.jobId} added successfully`);
    
    // Monitor queue status every second for 10 seconds
    console.log('\n⏰ Monitoring queue for 10 seconds...');
    
    for (let i = 1; i <= 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      response = await fetch('http://localhost:3005/api/test/queue-status');
      const status = await response.json();
      
      if (status.success) {
        const aiQueue = status.queues.ai_parse;
        console.log(`${i}s: waiting=${aiQueue.waiting}, active=${aiQueue.active}, completed=${aiQueue.completed}, failed=${aiQueue.failed}`);
        
        // Check if job moved from waiting to active or completed
        if (aiQueue.active > 0) {
          console.log('🏃 JOB IS ACTIVE! Processor is working!');
          return true;
        }
        
        if (aiQueue.completed > 0) {
          console.log('✅ JOB COMPLETED! Processor worked successfully!');
          return true;
        }
        
        if (aiQueue.failed > 0) {
          console.log('❌ Job failed - check server console for errors');
          return false;
        }
      }
    }
    
    console.log('\n⏰ 10 seconds elapsed with no processing activity');
    return false;
    
  } catch (error) {
    console.error('💥 Test error:', error.message);
    return false;
  }
};

testServerQueues()
  .then(success => {
    if (success) {
      console.log('\n🎉 SUCCESS: Server queue processors are working!');
      console.log('✅ The automatic PO processing issue should be resolved!');
    } else {
      console.log('\n❌ ISSUE PERSISTS: Server queue processors are not triggering');
      console.log('🔧 Need to investigate processor registration in the orchestrator');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test script failed:', error);
    process.exit(1);
  });