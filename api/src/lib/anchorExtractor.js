const DEFAULT_PATTERNS = [
  {
    id: 'po_number',
    label: 'Purchase Order',
      pattern: String.raw`(?:purchase\s+order|po)\s*(?:number|no\.?|#)\s*[:#-]?\s*`,
    contextBefore: 40,
    contextAfter: 140
  },
  {
    id: 'invoice_number',
    label: 'Invoice Number',
      pattern: String.raw`(?:invoice|inv)\s*(?:number|no\.?|#)\s*[:#-]?\s*`,
    contextBefore: 40,
    contextAfter: 120
  },
  {
    id: 'supplier',
    label: 'Supplier',
      pattern: String.raw`(?:supplier|vendor|from)\s*(?:name|:)\s*`,
    contextBefore: 30,
    contextAfter: 160
  },
  {
    id: 'ship_to',
    label: 'Ship To',
      pattern: String.raw`(?:ship\s*to|deliver\s*to|destination)\s*[:]?\s*`,
    contextBefore: 30,
    contextAfter: 160
  },
  {
    id: 'bill_to',
    label: 'Bill To',
      pattern: String.raw`(?:bill\s*to|pay\s*to)\s*[:]?\s*`,
    contextBefore: 30,
    contextAfter: 160
  },
  {
    id: 'totals',
    label: 'Totals',
      pattern: String.raw`(?:subtotal|tax|shipping|total\s*(?:amount)?|grand\s*total)\s*[:]?\s*`,
    contextBefore: 60,
    contextAfter: 160
  },
  {
    id: 'line_items',
    label: 'Line Items',
      pattern: String.raw`(?:qty|description|unit\s*price|extended\s*price|item|product)`,
    contextBefore: 80,
    contextAfter: Infinity, // Changed to Infinity - capture ALL line items until terminator
    maxMatches: 1, // Changed from 5 to 1 - we want ONE large section, not 5 small snippets
    terminatorPattern: String.raw`(?:subtotal|sub-total|sub\s+total|total\s*(?:amount)?|grand\s*total|payment\s*terms|notes|comments|thank\s*you|signature)` // Stop when we hit totals/footer section
  }
]

const DEFAULT_OPTIONS = {
  patterns: DEFAULT_PATTERNS,
  contextBefore: 60,
  contextAfter: 160,
  maxMatchesPerPattern: 3,
  minReductionPercent: 10,
  minSnippets: 1,
  globalMaxSnippets: 50 // Increased from 24 to allow more snippets for large POs
}

const ensureGlobal = (regexSource, flags = 'gi') => new RegExp(regexSource, flags.includes('g') ? flags : `${flags}g`)

const patternRegistry = new Map()

export function registerAnchorPatternSet(identifier, patterns = [], options = {}) {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Pattern set identifier must be a non-empty string')
  }

  const normalizedPatterns = Array.isArray(patterns) ? patterns : [patterns]

  if (!normalizedPatterns.every(pattern => typeof pattern === 'object' && pattern.pattern)) {
    throw new Error('Each pattern must be an object with a pattern property')
  }

  const existing = patternRegistry.get(identifier) || { patterns: [], options: {} }
  patternRegistry.set(identifier, {
    patterns: [...existing.patterns, ...normalizedPatterns],
    options: { ...existing.options, ...options }
  })
}

export function getRegisteredPatternSet(identifier) {
  return identifier ? patternRegistry.get(identifier) || null : null
}

export function clearAnchorPatternRegistry() {
  patternRegistry.clear()
}

export function extractAnchors(text, userOptions = {}) {
  if (!text || typeof text !== 'string') {
    return {
      applied: false,
      combinedText: text || '',
      snippets: [],
      stats: {
        originalLength: text ? text.length : 0,
        reducedLength: text ? text.length : 0,
        reductionPercent: 0,
        anchorsMatched: {}
      }
    }
  }

  const registryKey = userOptions.patternSet || userOptions.merchantId || userOptions.merchantKey
  const registryEntry = registryKey ? getRegisteredPatternSet(registryKey) : null

  const resolvedPatterns = userOptions.patterns || registryEntry?.patterns || DEFAULT_OPTIONS.patterns

  const options = {
    ...DEFAULT_OPTIONS,
    ...(registryEntry?.options || {}),
    ...userOptions,
    patterns: resolvedPatterns
  }

  const normalizedPatterns = options.patterns.map(pattern => ({
    ...pattern,
    regex: ensureGlobal(pattern.pattern, pattern.flags || 'gi'),
    contextBefore: pattern.contextBefore ?? options.contextBefore,
    contextAfter: pattern.contextAfter ?? options.contextAfter,
    maxMatches: pattern.maxMatches ?? options.maxMatchesPerPattern
  }))

  const snippets = []
  const anchorsMatched = {}
  const seenRanges = new Set()

  const maxSnippets = options.globalMaxSnippets > 0 ? options.globalMaxSnippets : null

  if (process.env.DEBUG_ANCHOR_EXTRACTION) {
    console.log(`[DEBUG_ANCHOR] Starting anchor extraction on ${text.length} chars with ${normalizedPatterns.length} patterns`)
    console.log(`[DEBUG_ANCHOR] maxSnippets: ${maxSnippets}`)
  }

  for (const pattern of normalizedPatterns) {
    let matches = 0
    let match
    while ((match = pattern.regex.exec(text)) && matches < pattern.maxMatches) {
      if (maxSnippets && snippets.length >= maxSnippets) {
        break
      }

      matches += 1
      anchorsMatched[pattern.id] = (anchorsMatched[pattern.id] || 0) + 1

      if (process.env.DEBUG_ANCHOR_EXTRACTION && pattern.id === 'line_items') {
        console.log(`[DEBUG_ANCHOR] Pattern '${pattern.id}' matched: "${match[0]}" at position ${match.index}`)
      }

      const start = Math.max(0, match.index - pattern.contextBefore)
      
      // Dynamic end calculation: if captureUntilEnd is true, search for terminator
      let end
      if (pattern.captureUntilEnd && pattern.terminatorPattern) {
        const terminatorRegex = new RegExp(pattern.terminatorPattern, 'i')
        const searchStart = match.index + match[0].length
        const terminatorMatch = terminatorRegex.exec(text.substring(searchStart))
        if (terminatorMatch) {
          end = searchStart + terminatorMatch.index
          if (process.env.DEBUG_ANCHOR_EXTRACTION) {
            console.log(`[DEBUG_ANCHOR] Pattern '${pattern.id}' - Terminator found: "${terminatorMatch[0]}" at position ${terminatorMatch.index}`)
            console.log(`[DEBUG_ANCHOR] Capturing from ${start} to ${end} (${end - start} chars)`)
          }
        } else {
          // If no terminator found, capture to end of document
          end = text.length
          if (process.env.DEBUG_ANCHOR_EXTRACTION) {
            console.log(`[DEBUG_ANCHOR] Pattern '${pattern.id}' - No terminator found, capturing to end of document`)
            console.log(`[DEBUG_ANCHOR] Capturing from ${start} to ${end} (${end - start} chars)`)
          }
        }
      } else {
        end = Math.min(text.length, match.index + match[0].length + pattern.contextAfter)
      }
      
      const rangeKey = `${start}:${end}`
      if (seenRanges.has(rangeKey)) {
        continue
      }
      seenRanges.add(rangeKey)

      const snippet = text.slice(start, end).trim()
      if (snippet.length === 0) {
        continue
      }

      snippets.push({
        anchorId: pattern.id,
        label: pattern.label,
        start,
        end,
        snippet
      })
    }
    if (maxSnippets && snippets.length >= maxSnippets) {
      break
    }
  }

  if (snippets.length === 0) {
    return {
      applied: false,
      combinedText: text,
      snippets: [],
      stats: {
        originalLength: text.length,
        reducedLength: text.length,
        reductionPercent: 0,
        anchorsMatched
      }
    }
  }

  snippets.sort((a, b) => a.start - b.start)

  const combinedText = snippets.map(snippet => snippet.snippet).join('\n---\n')
  const reducedLength = combinedText.length
  const originalLength = text.length
  const reductionPercent = Math.round((1 - reducedLength / originalLength) * 100)

  const applied = reductionPercent >= options.minReductionPercent && snippets.length >= options.minSnippets && reducedLength < originalLength

  return {
    applied,
    combinedText: applied ? combinedText : text,
    snippets,
    stats: {
      originalLength,
      reducedLength: applied ? reducedLength : originalLength,
      reductionPercent: applied ? reductionPercent : 0,
      anchorsMatched
    }
  }
}

export { DEFAULT_PATTERNS }
