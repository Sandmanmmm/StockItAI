/**
 * Test immediate processing to identify if there's a timing or connection issue
 */

console.log('🔬 Testing immediate processing issue...');

const testImmediateProcessing = async () => {
  try {
    // Get initial queue state
    console.log('📊 Getting initial queue state...');
    let response = await fetch('http://localhost:3005/api/test/queue-status');
    let status = await response.json();
    
    if (!status.success) {
      throw new Error('Failed to get initial queue status');
    }
    
    const initialWaiting = status.queues.ai_parse.waiting;
    console.log(`📋 Initial waiting jobs: ${initialWaiting}`);
    
    // Add a job
    console.log('🔄 Adding test job...');
    response = await fetch('http://localhost:3005/api/test/trigger-job');
    const jobResult = await response.json();
    
    if (!jobResult.success) {
      throw new Error('Failed to add job');
    }
    
    console.log(`✅ Job ${jobResult.jobId} added`);
    
    // Check queue state immediately
    console.log('⚡ Checking queue immediately after job addition...');
    response = await fetch('http://localhost:3005/api/test/queue-status');
    status = await response.json();
    
    const immediateWaiting = status.queues.ai_parse.waiting;
    const immediateActive = status.queues.ai_parse.active;
    
    console.log(`📊 Immediate state: waiting=${immediateWaiting}, active=${immediateActive}`);
    
    if (immediateActive > 0) {
      console.log('🏃 Job immediately went to active - processors are working!');
      return true;
    }
    
    if (immediateWaiting === initialWaiting + 1) {
      console.log('⏳ Job added to waiting queue but not immediately processed');
      
      // Monitor for 5 seconds intensively
      console.log('🔍 Monitoring every 500ms for 5 seconds...');
      
      for (let i = 1; i <= 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        response = await fetch('http://localhost:3005/api/test/queue-status');
        status = await response.json();
        
        const waiting = status.queues.ai_parse.waiting;
        const active = status.queues.ai_parse.active;
        const completed = status.queues.ai_parse.completed;
        const failed = status.queues.ai_parse.failed;
        
        console.log(`${i * 0.5}s: W=${waiting} A=${active} C=${completed} F=${failed}`);
        
        if (active > 0 || completed > initialWaiting || failed > 0) {
          console.log('🎯 Processing detected!');
          return true;
        }
      }
      
      console.log('❌ No processing detected after 5 seconds of monitoring');
      return false;
    }
    
    console.log('❓ Unexpected queue state after job addition');
    return false;
    
  } catch (error) {
    console.error('💥 Test error:', error.message);
    return false;
  }
};

testImmediateProcessing()
  .then(success => {
    if (success) {
      console.log('\n✅ PROCESSORS ARE WORKING!');
      console.log('🎉 The automatic PO processing issue has been resolved!');
    } else {
      console.log('\n❌ PROCESSORS ARE STILL NOT WORKING');
      console.log('🔧 Further investigation needed in processor registration');
      console.log('\nPossible issues:');
      console.log('1. Processor registration timing problem');
      console.log('2. Redis connection mismatch between job addition and processing');
      console.log('3. Bull queue instance isolation issue');
      console.log('4. Async initialization race condition');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });