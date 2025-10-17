import { beforeEach, describe, expect, it, jest } from '@jest/globals'

let EnhancedAIService
let textPreprocessor
let mockCreate
let parseFileMock
let handleAIParsingResultMock
let handleCriticalErrorMock

const baseAiResponse = JSON.stringify({
  confidence: 0.82,
  extractedData: {
    poNumber: '12345',
    supplier: { name: 'ExampleCo' },
    lineItems: [],
    dates: {},
    totals: {}
  },
  fieldConfidences: {},
  qualityIndicators: {},
  issues: [],
  suggestions: []
})

const loadService = async () => {
  const pdfBuffer = Buffer.concat([
    Buffer.from('%PDF-1.7\n'),
    Buffer.alloc(32, 0)
  ])

  return {
    service: new EnhancedAIService(),
    pdfBuffer
  }
}

describe('EnhancedAIService text preprocessing integration', () => {
  beforeEach(async () => {
    jest.resetModules()
    process.env.OPENAI_API_KEY = 'test-key'

    mockCreate = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            function_call: {
              name: 'extract_purchase_order',
              arguments: baseAiResponse
            },
            content: null
          }
        }
      ]
    })

    parseFileMock = jest.fn().mockResolvedValue({
      text: 'Purchase    Order Number:    12345\n\nSupplier Name: ExampleCo\n\nPage 1 of 2',
      pages: 2
    })

    handleAIParsingResultMock = jest.fn().mockResolvedValue({ status: 'ok' })
    handleCriticalErrorMock = jest.fn().mockResolvedValue({ status: 'error' })

    jest.unstable_mockModule('openai', () => ({
      default: jest.fn().mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      }))
    }))

    jest.unstable_mockModule('../fileParsingService.js', () => ({
      fileParsingService: {
        parseFile: parseFileMock
      }
    }))

  jest.unstable_mockModule('../errorHandlingService.js', () => ({
      errorHandlingService: {
        handleAIParsingResult: handleAIParsingResultMock,
        handleCriticalError: handleCriticalErrorMock
      },
      CONFIDENCE_THRESHOLDS: {
        MANUAL_REVIEW: 0.7
      }
    }))

  ;({ EnhancedAIService } = await import('../enhancedAIService.js'))
  ;({ textPreprocessor } = await import('../textPreprocessor.js'))
  })

  it('preprocesses PDF text before sending to OpenAI', async () => {
    const { service: svc, pdfBuffer } = await loadService()

    const result = await svc.parseDocument(pdfBuffer, 'wf-preprocess-test')

    expect(parseFileMock).toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledTimes(1)

  const requestPayload = mockCreate.mock.calls[0][0]
  const userMessage = requestPayload.messages.find(msg => msg.role === 'user')

  expect(requestPayload.functions[0].name).toBe('extract_purchase_order')
  expect(userMessage.content).toContain('PO#12345')
  expect(userMessage.content).not.toContain('Page 1 of 2')

    expect(result.metadata.preprocessing).toBeTruthy()
    expect(result.metadata.preprocessing.optimizedLength).toBeLessThan(result.metadata.preprocessing.originalLength)
    expect(Array.isArray(result.issues)).toBe(true)
    expect(result.metadata.preprocessing.reductionPercent).toBeGreaterThan(0)
    expect(result.metadata.preprocessing.anchorExtraction).toEqual(expect.objectContaining({
      applied: true,
      snippetCount: expect.any(Number)
    }))
  })

  it('falls back to raw text when preprocessing throws and records issue', async () => {
    const { service: svc, pdfBuffer } = await loadService()

    const preprocessSpy = jest.spyOn(textPreprocessor, 'preprocess').mockImplementation(() => {
      throw new Error('synthetic preprocessing failure')
    })

    const result = await svc.parseDocument(pdfBuffer, 'wf-preprocess-fallback')

    expect(mockCreate).toHaveBeenCalledTimes(1)
  const requestPayload = mockCreate.mock.calls[0][0]
  const userMessage = requestPayload.messages.find(msg => msg.role === 'user')
  expect(userMessage.content).toContain('Purchase    Order Number')

    expect(result.metadata.preprocessing).toMatchObject({
      failed: true,
      error: 'synthetic preprocessing failure'
    })
    expect(result.metadata.preprocessing.anchorExtraction).toBeDefined()

    expect(result.issues).toContain('Text preprocessing failed - raw text used for AI parsing')

    preprocessSpy.mockRestore()
  })

  it('keeps progress helpers scoped per parse call during concurrent chunking', async () => {
    const { service: svc } = await loadService()

    svc.chunkingConfig = {
      ...svc.chunkingConfig,
      maxChunkChars: 80,
      minChunkChars: 30,
      overlapChars: 5,
      maxChunks: 5
    }

    const pdfHeader = Buffer.from('%PDF-1.7\n')
    const bufferA = Buffer.concat([pdfHeader, Buffer.alloc(64, 0x41)])
    const bufferB = Buffer.concat([pdfHeader, Buffer.alloc(64, 0x42)])

    const textA = 'WF-A '.repeat(80)
    const textB = 'WF-B '.repeat(60)

    parseFileMock.mockImplementation((buffer) => {
      if (buffer === bufferA) {
        return Promise.resolve({ text: textA, pages: 6 })
      }
      if (buffer === bufferB) {
        return Promise.resolve({ text: textB, pages: 4 })
      }
      return Promise.resolve({ text: 'fallback text', pages: 1 })
    })

    const chunkPlanA = [
      { text: 'chunk-a1', length: 70, overlap: 5, estimatedTokens: 120 },
      { text: 'chunk-a2', length: 68, overlap: 5, estimatedTokens: 115 },
      { text: 'chunk-a3', length: 66, overlap: 5, estimatedTokens: 110 }
    ]
    const chunkPlanB = [
      { text: 'chunk-b1', length: 65, overlap: 5, estimatedTokens: 118 },
      { text: 'chunk-b2', length: 62, overlap: 5, estimatedTokens: 112 }
    ]

    const chunkPlanSpy = jest.spyOn(svc, '_createChunkPlan').mockImplementation((text) => {
      if (text.includes('WF-A')) {
        return chunkPlanA
      }
      if (text.includes('WF-B')) {
        return chunkPlanB
      }
      return []
    })

    const makeHelper = (label) => {
      const calls = []
      return {
        calls,
        publishSubStageProgress: jest.fn(async (...args) => {
          calls.push({ label, args })
          await new Promise(resolve => setTimeout(resolve, 1))
        })
      }
    }

    const helperA = makeHelper('A')
    const helperB = makeHelper('B')

    mockCreate.mockImplementation(async (request) => {
      const functionName = request.function_call?.name || request.functions?.[0]?.name
      await new Promise(resolve => setTimeout(resolve, functionName === 'extract_purchase_order' ? 3 : 1))

      if (functionName === 'extract_purchase_order') {
        return {
          choices: [
            {
              message: {
                function_call: {
                  name: 'extract_purchase_order',
                  arguments: JSON.stringify({
                    confidence: 0.9,
                    extractedData: {
                      poNumber: 'WF-PO',
                      supplier: { name: 'Supplier' },
                      lineItems: [{ description: 'header item', quantity: 1 }],
                      dates: {},
                      totals: {}
                    },
                    fieldConfidences: {},
                    qualityIndicators: {},
                    issues: [],
                    suggestions: []
                  })
                },
                content: null
              }
            }
          ]
        }
      }

      return {
        choices: [
          {
            message: {
              function_call: {
                name: 'extract_po_line_items',
                arguments: JSON.stringify({
                  lineItems: [{ description: 'chunk item', quantity: 2 }],
                  issues: []
                })
              },
              content: null
            }
          }
        ]
      }
    })

    const expectedCount = (chunkCount) => 5 + 2 * (chunkCount - 1)

    const [resultA, resultB] = await Promise.all([
      svc.parseDocument(bufferA, 'wf-A', {
        progressHelper: helperA,
        disableTextPreprocessing: true,
        disableAnchorExtraction: true
      }),
      svc.parseDocument(bufferB, 'wf-B', {
        progressHelper: helperB,
        disableTextPreprocessing: true,
        disableAnchorExtraction: true
      })
    ])

    expect(resultA).toBeTruthy()
    expect(resultB).toBeTruthy()

    const actualCounts = [helperA.calls.length, helperB.calls.length].sort((a, b) => a - b)
    const expectedCounts = [expectedCount(chunkPlanA.length), expectedCount(chunkPlanB.length)].sort((a, b) => a - b)

    expect(actualCounts).toEqual(expectedCounts)

    chunkPlanSpy.mockRestore()
  })
})
