// Manually fail a specific stuck job to trigger retry
import Bull from 'bull'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const REDIS_URL = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL

if (!REDIS_URL) {
  console.error('❌ No Redis URL found')
  process.exit(1)
}

const queue = new Bull('ai-parsing', REDIS_URL, {
  redis: {
    tls: {
      rejectUnauthorized: false
    },
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  }
})

async function failJob(jobId) {
  try {
    console.log(`\n🔍 Looking for job ${jobId}...`)
    
    const job = await queue.getJob(jobId)
    
    if (!job) {
      console.error(`❌ Job ${jobId} not found`)
      return
    }
    
    console.log(`📋 Job ${jobId} found:`)
    console.log(`   State: ${await job.getState()}`)
    console.log(`   Workflow: ${job.data.workflowId}`)
    console.log(`   File: ${job.data.data?.fileName}`)
    
    console.log(`\n💥 Manually failing job ${jobId}...`)
    await job.moveToFailed({ message: 'Manually failed to trigger retry with new warmup fix' }, true)
    
    console.log(`✅ Job ${jobId} moved to failed state`)
    console.log(`   Bull will automatically retry this job`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await queue.close()
    process.exit(0)
  }
}

// Get job ID from command line
const jobId = process.argv[2]

if (!jobId) {
  console.error('Usage: node fail-stuck-job.mjs <jobId>')
  process.exit(1)
}

failJob(jobId)
