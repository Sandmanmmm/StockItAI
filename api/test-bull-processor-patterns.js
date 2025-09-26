/**
 * Test the exact Bull processor pattern to isolate the issue
 */

import Bull from 'bull';

console.log('🔬 Testing Bull processor patterns...');

const testBullProcessors = async () => {
  try {
    const redisConfig = {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false
    };
    
    console.log('🔧 Creating test queue...');
    const testQueue = new Bull('processor-test', {
      redis: redisConfig,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 5,
        removeOnFail: 5
      }
    });
    
    console.log('📝 Testing Pattern 1: Default processor (concurrency only)');
    
    // Pattern 1: Default processor (no job name)
    testQueue.process(1, async (job) => {
      console.log('🎯 PATTERN 1 PROCESSOR TRIGGERED:', job.id, job.data);
      return { processed: 'pattern1', timestamp: Date.now() };
    });
    
    await testQueue.resume();
    console.log('✅ Pattern 1 processor registered');
    
    // Add a job without name (should match default processor)
    console.log('📋 Adding job without name...');
    const job1 = await testQueue.add({ message: 'test without name', pattern: 1 });
    console.log('✅ Job 1 added:', job1.id);
    
    // Wait and check
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const job1State = await job1.getState();
    console.log('📊 Job 1 final state:', job1State);
    
    // Clean up
    await testQueue.close();
    console.log('🧹 Cleaned up test queue');
    
    if (job1State === 'completed') {
      console.log('🎉 SUCCESS: Default processor pattern works!');
      return true;
    } else {
      console.log('❌ FAILED: Default processor pattern not working');
      return false;
    }
    
  } catch (error) {
    console.error('💥 Test error:', error);
    return false;
  }
};

testBullProcessors()
  .then(success => {
    if (success) {
      console.log('\n✅ RESULT: Bull default processor pattern is working');
      console.log('🔍 The issue might be elsewhere in our orchestrator setup');
    } else {
      console.log('\n❌ RESULT: Bull default processor pattern is NOT working');
      console.log('🔧 We need to use a different processor registration approach');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test script failed:', error);
    process.exit(1);
  });