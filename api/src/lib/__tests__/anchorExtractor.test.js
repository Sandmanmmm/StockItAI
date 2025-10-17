import { afterEach, describe, expect, it } from '@jest/globals'
import {
  extractAnchors,
  DEFAULT_PATTERNS,
  registerAnchorPatternSet,
  clearAnchorPatternRegistry
} from '../anchorExtractor.js'

describe('anchorExtractor', () => {
  afterEach(() => {
    clearAnchorPatternRegistry()
  })

  it('extracts anchored snippets and reduces content length', () => {
      const text = `Scanned by OfficeJet\nCompany Header Information\nPurchase Order Number: 12345\nSupplier Name: Exotic Wholesale\nShip To: 123 Ocean Ave, Miami FL\nRandom Notes About Delivery\nLine Items:\nDescription Qty Price\nWidget A 10 $5.00\nWidget B 5 $7.00\nPage 1 of 4\nFooter Contact Details\nGrand Total: $120.00`

      const focusedPatterns = DEFAULT_PATTERNS
        .filter(pattern => ['po_number', 'supplier', 'totals'].includes(pattern.id))
        .map(pattern => ({
          ...pattern,
          contextBefore: 10,
          contextAfter: 60
        }))

      const result = extractAnchors(text, {
        patterns: focusedPatterns,
        minReductionPercent: 0,
        contextBefore: 10,
        contextAfter: 60,
        maxMatchesPerPattern: 1
      })

      expect(result.applied).toBe(true)
    expect(result.snippets.length).toBeGreaterThan(0)
    expect(result.stats.reductionPercent).toBeGreaterThan(0)
    expect(result.snippets.map(snippet => snippet.anchorId)).toContain('po_number')
      const snippetsByAnchor = Object.fromEntries(result.snippets.map(snippet => [snippet.anchorId, snippet.snippet]))
      expect(snippetsByAnchor.po_number).toContain('Purchase Order Number')
      expect(snippetsByAnchor.totals).toContain('Grand Total')
    expect(result.combinedText.length).toBeLessThan(text.length)
  })

  it('falls back to original text when no anchors match', () => {
    const text = 'This document contains no relevant purchase order information.'

    const result = extractAnchors(text)

    expect(result.applied).toBe(false)
    expect(result.snippets).toHaveLength(0)
    expect(result.combinedText).toBe(text)
    expect(result.stats.reductionPercent).toBe(0)
  })

  it('respects custom patterns and context window', () => {
    const text = 'Reference ID: ABC-12345. Details: This is a custom test.'

    const customPattern = [{
      id: 'reference_id',
      label: 'Reference ID',
  pattern: 'reference\\s*id',
      contextBefore: 0,
      contextAfter: 25
    }]

    const result = extractAnchors(text, {
      patterns: customPattern,
      minReductionPercent: 0,
      contextBefore: 0,
      contextAfter: 12
    })

    expect(result.combinedText.length).toBeLessThan(text.length)
    expect(result.snippets).toHaveLength(1)
    expect(result.combinedText).toContain('Reference ID: ABC-12345')
    expect(result.applied).toBe(true)
  })

  it('does not apply when reduction threshold not met', () => {
    const text = 'Purchase Order Number: 12345'

    const result = extractAnchors(text, {
      minReductionPercent: 50
    })

    expect(result.applied).toBe(false)
    expect(result.combinedText).toBe(text)
  })

  it('limits matches per pattern and preserves order', () => {
    const text = `Item Qty Price\nItemB 2 $20\nItem Qty Price\nItemC 3 $30`

    const result = extractAnchors(text, {
      minReductionPercent: 0,
      maxMatchesPerPattern: 1
    })

    expect(result.snippets.length).toBe(1)
    expect(result.snippets[0].start).toBeLessThan(result.snippets[0].end)
  })

  it('exposes default patterns for customization', () => {
    expect(Array.isArray(DEFAULT_PATTERNS)).toBe(true)
    expect(DEFAULT_PATTERNS.length).toBeGreaterThan(0)
    expect(DEFAULT_PATTERNS[0]).toHaveProperty('pattern')
  })

  it('supports merchant-specific pattern sets with snippet limits', () => {
    registerAnchorPatternSet('merchant-123', [
      {
        id: 'custom_footer',
        label: 'Custom Footer',
        pattern: 'custom footer stamp',
        contextBefore: 10,
        contextAfter: 30,
        maxMatches: 2
      }
    ], {
      globalMaxSnippets: 2
    })

    const text = `Header info
Custom Footer Stamp -- remove this
Line item: Widget
Custom Footer Stamp duplicate`

    const result = extractAnchors(text, {
      merchantId: 'merchant-123',
      minReductionPercent: 0
    })

    expect(result.applied).toBe(true)
    expect(result.snippets).toHaveLength(2)
    expect(result.snippets.every(snippet => snippet.anchorId === 'custom_footer')).toBe(true)
    expect(result.stats.anchorsMatched.custom_footer).toBe(2)
  })
})
