# Markdown Code Block Parsing Fix

## Problem
AI parsing was completing but extracting **0 line items** from POs. The logs showed:

```
⚠️ Could not parse first chunk response, will try other chunks
⚠️ Failed to process chunk 2: Unexpected token '`', "```json\n{\n"... is not valid JSON
⚠️ Failed to process chunk 3: Unexpected token '`', "```json\n{\n"... is not valid JSON
❌ Failed to merge chunk results: Unexpected token '`', "```json\n{\n"... is not valid JSON
⚠️ Falling back to first chunk result
```

**Root Cause:** OpenAI was wrapping JSON responses in markdown code blocks (` ```json ... ``` `), but the code was trying to parse them directly as JSON without stripping the markdown formatting first.

## Timeline
- **16:30:22** - First chunk parse failure detected
- **16:31:22** - Chunk 2 parse failure
- **16:32:22** - Chunk 3 parse failure, merge failed
- **16:33:23** - AI parsing "completed successfully" but extracted 0 line items
- **16:36:22** - Job retried, same failures occurred

## Impact
- POs appeared to process successfully (85% confidence)
- But **no line items were extracted** → database_save stage had nothing to save
- PO stuck in "processing" state indefinitely
- All previous timeout fixes were working correctly, but data extraction was broken

## Solution
**Commit:** 8628797
**File:** `api/src/lib/enhancedAIService.js`

### Changes:

1. **Added helper function** to strip markdown code blocks:
```javascript
_stripMarkdownCodeBlocks(content) {
  if (!content) return '{}'
  
  let cleaned = content.trim()
  
  // Remove markdown code blocks: ```json ... ``` or ``` ... ```
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '')
    cleaned = cleaned.replace(/\n?```\s*$/, '')
  }
  
  return cleaned.trim()
}
```

2. **Updated prompts** to explicitly request raw JSON:
- Main prompt: "Return the data in this JSON format ONLY (do not wrap in markdown code blocks)"
- Chunk prompt: "DO NOT wrap the JSON in markdown code blocks - return ONLY the raw JSON object."

3. **Applied stripping** to all JSON.parse() operations:
- First chunk parsing
- Subsequent chunk parsing  
- Final merge result parsing

## Expected Behavior
After deployment:
- ✅ OpenAI responses (with or without markdown) will be correctly parsed
- ✅ Line items will be extracted from all chunks
- ✅ Chunks will merge successfully
- ✅ database_save stage will receive actual data to save
- ✅ POs will complete processing with line items

## Verification
After deployment, check:
1. No more "Unexpected token" errors in logs
2. "First chunk: extracted X line items" messages appear
3. "Multi-chunk processing complete: merged X total line items" shows count > 0
4. POs have line items in database after AI parsing
5. database_save queue shows active jobs (not skipped)

## Related Issues Fixed
This was the **final blocker** in the processing pipeline. Previous fixes resolved:
1. ✅ Vercel timeout (30s → 180s)
2. ✅ OpenAI timeout (120s → 60s)
3. ✅ Supabase download timeout (60s → 120s)
4. ✅ Chunking threshold (12k → 6k)
5. ✅ Duplicate job detection
6. ✅ **Markdown code block parsing** ← THIS FIX

## Status
✅ **Deployed:** 2025-10-12 16:43 UTC
🔍 **Monitoring:** Watch for successful line item extraction in next PO processing
