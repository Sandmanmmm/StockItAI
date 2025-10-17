import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const progressHelpers = []
const parseDocumentMock = jest.fn()

const publishStageMock = jest.fn().mockResolvedValue()
const publishProgressMock = jest.fn().mockResolvedValue()
const publishCompletionMock = jest.fn().mockResolvedValue()
const publishErrorMock = jest.fn().mockResolvedValue()

const redisDefaultMock = {
  initializeConnections: jest.fn().mockResolvedValue(),
  waitForConnection: jest.fn().mockResolvedValue(),
  redis: {
    status: 'ready',
    setex: jest.fn().mockResolvedValue(),
    get: jest.fn().mockResolvedValue(null)
  }
}

jest.unstable_mockModule('../progressHelper.js', () => {
  class MockProgressHelper {
    constructor(options) {
      this.options = options
      this.id = `helper-${progressHelpers.length + 1}`
      progressHelpers.push(this)
      this.publishProgress = jest.fn().mockResolvedValue()
      this.publishStageComplete = jest.fn().mockResolvedValue()
      this.publishSubStageProgress = jest.fn().mockResolvedValue()
    }
  }

  return { ProgressHelper: MockProgressHelper }
})

jest.unstable_mockModule('../enhancedAIService.js', () => ({
  enhancedAIService: {
    parseDocument: parseDocumentMock
  }
}))

jest.unstable_mockModule('../redisManager.js', () => ({
  default: redisDefaultMock,
  redisManager: {
    publishMerchantStage: publishStageMock,
    publishMerchantProgress: publishProgressMock,
    publishMerchantCompletion: publishCompletionMock,
    publishMerchantError: publishErrorMock
  }
}))

jest.unstable_mockModule('../processorRegistrationService.js', () => ({
  processorRegistrationService: {
    addJob: jest.fn().mockResolvedValue()
  }
}))

jest.unstable_mockModule('../databasePersistenceService.js', () => ({
  DatabasePersistenceService: class {
    constructor() {
      this.persistAIResults = jest.fn().mockResolvedValue({})
    }
  }
}))

jest.unstable_mockModule('../storageService.js', () => ({
  SupabaseStorageService: class {
    constructor() {
      this.downloadFile = jest.fn()
    }
  }
}))

jest.unstable_mockModule('../fileParsingService.js', () => ({
  FileParsingService: class {
    constructor() {
      this.parseFile = jest.fn()
    }
  }
}))

jest.unstable_mockModule('../stageResultStore.js', () => ({
  stageResultStore: {
    initialize: jest.fn().mockResolvedValue(),
    saveStageResult: jest.fn().mockResolvedValue(),
    getAccumulatedData: jest.fn().mockResolvedValue({})
  }
}))

jest.unstable_mockModule('../refinementPipelineService.js', () => ({
  RefinementPipelineService: class {}
}))

jest.unstable_mockModule('../../services/simpleProductDraftService.js', () => ({
  SimpleProductDraftService: class {}
}))

jest.unstable_mockModule('../../services/refinementConfigService.js', () => ({
  RefinementConfigService: class {}
}))

jest.unstable_mockModule('../db.js', () => ({
  db: {
    getClient: jest.fn().mockResolvedValue({})
  },
  prismaOperation: jest.fn()
}))

const { WorkflowOrchestrator, WORKFLOW_STAGES } = await import('../workflowOrchestrator.js')

describe('WorkflowOrchestrator telemetry smoke test', () => {
  beforeEach(() => {
    parseDocumentMock.mockReset()
    publishStageMock.mockClear()
    publishProgressMock.mockClear()
    publishCompletionMock.mockClear()
    publishErrorMock.mockClear()
    redisDefaultMock.redis.setex.mockClear()
    redisDefaultMock.redis.get.mockClear()
    redisDefaultMock.initializeConnections.mockClear()
    redisDefaultMock.waitForConnection.mockClear()
    progressHelpers.length = 0
  })

  it('passes unique progress helpers to enhancedAIService for each workflow run', async () => {
    parseDocumentMock.mockImplementation(async (input, workflowId, options) => {
      await new Promise(resolve => setTimeout(resolve, workflowId === 'wf-A' ? 2 : 1))
      return {
        success: true,
        extractedData: {
          lineItems: [{ description: `${workflowId}-item` }]
        },
        lineItems: [{ description: `${workflowId}-item` }],
        model: 'mock-model',
        confidence: {
          normalized: 0.8,
          overall: 80
        }
      }
    })

    const orchestrator = new WorkflowOrchestrator()

    const metadataByWorkflow = new Map([
      ['wf-A', { data: { purchaseOrderId: 'po-A', merchantId: 'm-1' } }],
      ['wf-B', { data: { purchaseOrderId: 'po-B', merchantId: 'm-2' } }]
    ])

    orchestrator.getWorkflowMetadata = jest.fn(async (workflowId) => metadataByWorkflow.get(workflowId))
    orchestrator.saveAndAccumulateStageData = jest.fn(async (
      workflowId,
      stage,
      stageResult,
      nextStageData
    ) => ({ ...nextStageData }))
    orchestrator.updateWorkflowStage = jest.fn().mockResolvedValue()
    orchestrator.scheduleNextStage = jest.fn().mockResolvedValue()
    orchestrator.failWorkflow = jest.fn().mockResolvedValue()

    const baseJobPayload = {
      fileName: 'test.pdf',
      parsedContent: 'Sample parsed content',
      mimeType: 'application/pdf'
    }

    const jobA = {
      data: {
        workflowId: 'wf-A',
        data: {
          ...baseJobPayload,
          purchaseOrderId: 'po-A',
          merchantId: 'm-1'
        }
      },
      progress: jest.fn()
    }

    const jobB = {
      data: {
        workflowId: 'wf-B',
        data: {
          ...baseJobPayload,
          parsedContent: 'Different text',
          purchaseOrderId: 'po-B',
          merchantId: 'm-2'
        }
      },
      progress: jest.fn()
    }

    const [resultA, resultB] = await Promise.all([
      orchestrator.processAIParsing(jobA),
      orchestrator.processAIParsing(jobB)
    ])

    expect(resultA.success).toBe(true)
    expect(resultB.success).toBe(true)

    expect(parseDocumentMock).toHaveBeenCalledTimes(2)

    const helpersFromCalls = parseDocumentMock.mock.calls.map(([, workflowId, options]) => ({
      workflowId,
      helper: options.progressHelper
    }))

    expect(new Set(helpersFromCalls.map(({ helper }) => helper)).size).toBe(helpersFromCalls.length)
    expect(helpersFromCalls.every(({ helper }) => progressHelpers.includes(helper))).toBe(true)
    helpersFromCalls.forEach(({ workflowId, helper }) => {
      expect(helper.options.workflowId).toBe(workflowId)
      expect(helper.publishProgress).toHaveBeenCalled()
    })

    expect(orchestrator.saveAndAccumulateStageData).toHaveBeenCalledTimes(2)
    expect(orchestrator.scheduleNextStage).toHaveBeenCalledTimes(2)
    expect(publishStageMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      stage: WORKFLOW_STAGES.AI_PARSING
    }))
  })
})
