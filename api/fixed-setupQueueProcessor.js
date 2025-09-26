/**
 * Clean workflowOrchestrator.js setupQueueProcessor function
 * This will replace the corrupted version
 */

// Find lines around 292-350 in workflowOrchestrator.js and replace with this:

async setupQueueProcessor(queue, jobType, concurrency) {
  console.log(`🔧 Setting up processor for ${jobType} with concurrency ${concurrency}`);
  
  // Create processor function with comprehensive error handling
  const processorFunction = async (job) => {
    const startTime = Date.now();
    
    try {
      console.log(`🎯 BULL PROCESSOR TRIGGERED for ${jobType} job ${job.id}`);
      console.log(`📋 Job details:`, {
        workflowId: job.data?.workflowId,
        stage: job.data?.stage,
        attempts: job.attemptsMade,
        name: job.name
      });
      
      // Process the job through the main processing pipeline
      const result = await this.processJob(job, jobType);
      
      const duration = Date.now() - startTime;
      console.log(`✅ Completed ${jobType} job ${job.id} in ${duration}ms`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`💥 PROCESSOR ERROR in ${jobType} job ${job.id} after ${duration}ms:`, error.message);
      throw error;
    }
  };
  
  try {
    console.log(`🔧 Registering processor for ${jobType}...`);
    
    // CRITICAL FIX: Use concurrency parameter, not jobType
    // This is the pattern that works (proven by emergency fix)
    queue.process(concurrency, processorFunction);
    
    console.log(`✅ Processor registered for ${jobType} with concurrency ${concurrency}`);
    
    // Ensure queue is resumed and ready
    await queue.resume();
    console.log(`▶️ Queue ${jobType} resumed and ready`);
    
  } catch (processorError) {
    console.error(`❌ Failed to register processor for ${jobType}:`, processorError.message);
    throw processorError;
  }
  
  // Diagnostic check
  try {
    const waitingJobs = await queue.getWaiting();
    console.log(`🔍 Queue ${jobType} has ${waitingJobs.length} waiting jobs`);
    
    if (waitingJobs.length > 0) {
      const firstJob = waitingJobs[0];
      console.log(`🔬 First waiting job:`, {
        id: firstJob.id,
        name: firstJob.name,
        workflowId: firstJob.data?.workflowId,
        attempts: firstJob.attemptsMade
      });
      console.log(`🚀 Found ${waitingJobs.length} waiting jobs in ${jobType}, attempting to trigger processing...`);
    }
  } catch (diagnosticError) {
    console.log(`🔍 Queue ${jobType} diagnostic check failed:`, diagnosticError.message);
  }
  
  console.log(`✅ Initialized ${jobType} queue processor`);
}