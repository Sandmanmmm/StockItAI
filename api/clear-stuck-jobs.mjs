import Bull from 'bull'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
}

const queue = new Bull('ai-parsing', { redis: redisConfig })

async function clearStuckJobs() {
  try {
    console.log('🔍 Checking for stuck jobs...\n')
    
    const activeJobs = await queue.getActive()
    console.log(`Found ${activeJobs.length} active jobs\n`)
    
    for (const job of activeJobs) {
      const runningTime = Date.now() - new Date(job.processedOn).getTime()
      const runningMinutes = Math.floor(runningTime / 1000 / 60)
      
      console.log(`Job ${job.id}: Running for ${runningMinutes} minutes`)
      
      if (runningMinutes > 2) {
        console.log(`  ⚠️  This job is stuck (>2 min), failing it...`)
        try {
          await job.moveToFailed({ message: 'Manually failed - stuck for >2 minutes' }, true)
          console.log(`  ✅ Job ${job.id} moved to failed`)
        } catch (err) {
          console.log(`  ❌ Failed to move job: ${err.message}`)
        }
      } else {
        console.log(`  ✅ Job ${job.id} is OK`)
      }
      console.log()
    }
    
    console.log('✅ Done')
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

clearStuckJobs()
