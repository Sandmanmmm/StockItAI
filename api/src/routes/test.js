/**
 * Test routes for debugging orchestrator functionality
 */

import { Router } from 'express'
import { workflowOrchestrator } from '../lib/workflowOrchestrator.js'

const router = Router()

// GET /api/test/queue-debug - Debug queue registration
router.get('/queue-debug', async (req, res) => {
  try {
    console.log('🔍 Debugging queue registration...')
    
    const debugInfo = {
      isInitialized: workflowOrchestrator.isInitialized,
      queueKeys: [],
      queueTypes: [],
      queues: {}
    }
    
    // Check what keys are stored in the queues Map
    if (workflowOrchestrator.queues) {
      debugInfo.queueKeys = Array.from(workflowOrchestrator.queues.keys())
      
      // Check each queue type
      const expectedJobTypes = ['ai_parse', 'database_save', 'shopify_sync', 'status_update']
      
      for (const jobType of expectedJobTypes) {
        const queue = workflowOrchestrator.queues.get(jobType)
        debugInfo.queues[jobType] = {
          exists: !!queue,
          name: queue ? queue.name : 'N/A',
          ready: queue ? 'unknown' : 'N/A'
        }
        
        if (queue) {
          try {
            const waiting = await queue.getWaiting()
            const active = await queue.getActive()
            debugInfo.queues[jobType].waiting = waiting.length
            debugInfo.queues[jobType].active = active.length
            debugInfo.queues[jobType].ready = 'yes'
          } catch (error) {
            debugInfo.queues[jobType].ready = 'error: ' + error.message
          }
        }
      }
    }
    
    console.log('📋 Queue debug info:', debugInfo)
    
    res.json({
      success: true,
      debug: debugInfo,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Queue debug error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// GET /api/test/trigger-job - Simple test to trigger a job
router.get('/trigger-job', async (req, res) => {
  try {
    console.log('🧪 Test endpoint: Triggering AI parsing job...')
    
    const testJobData = {
      workflowId: `test_${Date.now()}`,
      stage: 'ai_parsing',
      data: {
        uploadId: 'test-upload',
        fileName: 'test-job.csv',
        merchantId: 'test-merchant',
        fileBuffer: Buffer.from('test,data\nitem1,5,$25.00'),
        options: {
          confidenceThreshold: 0.85,
          reprocessing: false
        }
      }
    }
    
    console.log('📋 Adding ai_parse job to queue...')
    const job = await workflowOrchestrator.addJobToQueue('ai_parse', testJobData)
    
    console.log(`✅ Job ${job.id} added successfully`)
    console.log('👀 Watch server console for: "🎯 BULL PROCESSOR TRIGGERED"')
    
    res.json({
      success: true,
      message: 'Test job added to queue',
      jobId: job.id,
      workflowId: testJobData.workflowId
    })
    
  } catch (error) {
    console.error('❌ Test endpoint error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// GET /api/test/queue-status - Check queue status
router.get('/queue-status', async (req, res) => {
  try {
    console.log('🔍 Checking queue status...')
    
    const queueStatus = {}
    const queueNames = ['ai_parse', 'database_save', 'shopify_sync', 'status_update']
    
    for (const queueName of queueNames) {
      const queue = workflowOrchestrator.queues.get(queueName)
      if (queue) {
        const waiting = await queue.getWaiting()
        const active = await queue.getActive()
        const completed = await queue.getCompleted()
        const failed = await queue.getFailed()
        
        queueStatus[queueName] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          waitingJobs: waiting.map(job => ({ id: job.id, name: job.name, workflowId: job.data?.workflowId })),
          activeJobs: active.map(job => ({ id: job.id, name: job.name, workflowId: job.data?.workflowId }))
        }
      } else {
        queueStatus[queueName] = { error: 'Queue not found' }
      }
    }
    
    res.json({
      success: true,
      queues: queueStatus,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Queue status error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// POST /api/test/start-workflow - Start a test workflow
router.post('/start-workflow', async (req, res) => {
  try {
    console.log('🚀 Test endpoint: Starting workflow...')
    
    const workflowData = req.body || {
      uploadId: 'test-upload-' + Date.now(),
      fileName: 'test-workflow.csv',
      merchantId: 'test-merchant',
      options: {
        confidenceThreshold: 0.85,
        reprocessing: false
      }
    }
    
    console.log('📋 Workflow data:', workflowData)
    
    const workflowId = await workflowOrchestrator.startWorkflow(workflowData)
    
    console.log(`✅ Workflow ${workflowId} started successfully`)
    console.log('👀 Watch server console for: "🎯 BULL PROCESSOR TRIGGERED"')
    
    res.json({
      success: true,
      message: 'Test workflow started',
      workflowId: workflowId
    })
    
  } catch (error) {
    console.error('❌ Start workflow error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

export default router