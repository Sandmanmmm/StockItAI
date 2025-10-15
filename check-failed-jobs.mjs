import Bull from 'bull'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const REDIS_URL = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL

const queue = new Bull('ai-parsing', REDIS_URL, {
  redis: {
    tls: { rejectUnauthorized: false },
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  }
})

async function checkFailedJobs() {
  try {
    console.log('\n🔍 Checking failed jobs in ai-parsing queue...\n')
    
    const failed = await queue.getFailed()
    
    console.log(`Found ${failed.length} failed jobs:\n`)
    
    for (const job of failed) {
      const age = Math.round((Date.now() - job.processedOn) / 1000 / 60)
      console.log(`📋 Job ${job.id}:`)
      console.log(`   Workflow: ${job.data.workflowId}`)
      console.log(`   File: ${job.data.data?.fileName}`)
      console.log(`   Failed: ${age}m ago`)
      console.log(`   Attempts: ${job.attemptsMade}`)
      console.log(`   Error: ${job.failedReason}`)
      console.log()
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await queue.close()
    process.exit(0)
  }
}

checkFailedJobs()
