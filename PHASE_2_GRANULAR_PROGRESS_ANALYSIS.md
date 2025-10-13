# Phase 2: Granular Progress Tracking - Implementation Analysis

**Date:** October 12, 2025  
**Current State:** Coarse progress (5%, 10%, 30%, 90%, 100%)  
**Target State:** Granular progress (1-2% increments with sub-stage details)  
**Estimated Effort:** 2-3 days  
**Priority:** HIGH

---

## 🎯 Objectives

### User Experience Goals
- **Before:** "AI parsing... 50% complete" (user waits 30+ seconds with no feedback)
- **After:** "Processing chunk 2/3 (67%)... Extracted 3 line items" (user sees continuous progress)

### Technical Goals
1. **Granular Updates:** 1-2% progress increments instead of 40% jumps
2. **Sub-Stage Visibility:** Show what's happening inside each stage
3. **Real-Time Feedback:** <1 second between progress updates
4. **Actionable Details:** "Parsing page 4/5" instead of "Parsing document"

---

## 📊 Current Progress Tracking Analysis

### **Stage 1: AI Parsing** (Current)
```
5% → Initial setup
30% → AI call started
90% → AI call completed
100% → Stage complete
```
**Gap:** 85% jump from 5% → 90% (30-60 seconds with no updates)

### **Stage 2: Database Save** (Current)
```
10% → Initial setup
30% → Starting persistence
90% → Persistence complete
100% → Stage complete
```
**Gap:** 60% jump from 30% → 90% (10-20 seconds with no updates)

### **Stage 3: Shopify Sync** (Current)
```
10% → Initial setup
50% → Sync started
90% → Sync complete
100% → Stage complete
```
**Gap:** 40% jump from 10% → 50% and 50% → 90%

---

## 🔍 Sub-Stage Opportunities

### **AI Parsing Stage** (Total: 0-40%)

#### Sub-Stage 1: PDF Parsing (0-8%)
**Current:** No visibility  
**Opportunity:** 
- Track page-by-page parsing (5-page PDF = 1.6% per page)
- Show "Parsing page 3/5 (60%)"

#### Sub-Stage 2: Text Extraction (8-12%)
**Current:** No visibility  
**Opportunity:**
- Show character count extraction
- Show "Extracted 9,107 characters"

#### Sub-Stage 3: Document Chunking (12-15%)
**Current:** Silent operation  
**Opportunity:**
- Show chunk creation "Creating 3 chunks with 1k overlap"
- Show "Chunk 1: 6,000 chars, Chunk 2: 5,500 chars"

#### Sub-Stage 4: OpenAI Processing (15-35%)
**Current:** Silent 20-60 second wait  
**Opportunity:**
- **Chunk 1 processing:** 15-22% (7%)
- **Chunk 2 processing:** 22-29% (7%)
- **Chunk 3 processing:** 29-35% (6%)
- Show "Processing chunk 2/3 with OpenAI API..."
- Show "Extracted 2 line items from chunk 2"

#### Sub-Stage 5: Result Merging (35-40%)
**Current:** Silent operation  
**Opportunity:**
- Show "Merging results from 3 chunks"
- Show "Total line items: 5"
- Show "Confidence: 95%"

### **Database Save Stage** (Total: 40-60%)

#### Sub-Stage 1: Validation (40-42%)
**Current:** No visibility  
**Opportunity:**
- Show "Validating 5 line items"
- Show "Checking for duplicates"

#### Sub-Stage 2: Line Item Persistence (42-58%)
**Current:** Silent bulk operation  
**Opportunity:**
- **Per-item progress:** 42% + (index / total) * 16%
- Show "Saving item 3/5: Widget Pro X (SKU-123)"
- Show "Saved item 3/5 ✓"
- Update every item or every 5 items (whichever is more frequent)

#### Sub-Stage 3: Relationship Creation (58-60%)
**Current:** No visibility  
**Opportunity:**
- Show "Creating supplier relationships"
- Show "Linking 5 items to PO #1760281084240"

### **Shopify Sync Stage** (Total: 60-100%)

#### Sub-Stage 1: Product Matching (60-70%)
**Current:** No visibility  
**Opportunity:**
- Show "Matching 5 products to Shopify catalog"
- Show "Found 3 matches, 2 new products"

#### Sub-Stage 2: Inventory Update (70-90%)
**Current:** Silent operation  
**Opportunity:**
- **Per-product:** 70% + (index / total) * 20%
- Show "Updating inventory for Widget Pro X"
- Show "Updated 4/5 products"

#### Sub-Stage 3: Order Creation (90-100%)
**Current:** Silent operation  
**Opportunity:**
- Show "Creating Shopify purchase order"
- Show "Shopify Order ID: gid://shopify/..."

---

## 🛠️ Implementation Strategy

### **Approach 1: Progress Context Object** ✅ Recommended

Pass a progress context through the call stack to enable granular updates at any level.

```javascript
// Progress context structure
const progressContext = {
  merchantId: 'cmg...',
  purchaseOrderId: 'cmg...',
  workflowId: 'wf_...',
  stageBaseProgress: 0, // Base progress for current stage (0 for AI parsing)
  stageProgressRange: 40, // Progress range for stage (0-40% for AI parsing)
  publishProgress: async (localProgress, message, details) => {
    const globalProgress = stageBaseProgress + (localProgress / 100) * stageProgressRange
    await redisManagerInstance.publishMerchantProgress(merchantId, {
      poId: purchaseOrderId,
      workflowId,
      stage: 'ai_parsing',
      progress: Math.round(globalProgress),
      message,
      details
    })
  }
}
```

**Benefits:**
- ✅ Clean separation of concerns
- ✅ No coupling between services
- ✅ Easy to add granular updates anywhere
- ✅ Consistent progress calculation

### **Approach 2: Progress Callback** (Alternative)

Pass a simple callback function down the stack.

```javascript
const publishProgress = async (progress, message) => {
  await redisManagerInstance.publishMerchantProgress(...)
}

await enhancedAIService.parseDocument(content, workflowId, { publishProgress })
```

**Benefits:**
- ✅ Simpler API
- ❌ Harder to calculate global progress
- ❌ More coupling

---

## 📝 Implementation Plan

### **Step 1: Create Progress Helper** (1 hour)

```javascript
// api/src/lib/progressHelper.js
export class ProgressHelper {
  constructor({ merchantId, purchaseOrderId, workflowId, redisManager }) {
    this.merchantId = merchantId
    this.purchaseOrderId = purchaseOrderId
    this.workflowId = workflowId
    this.redisManager = redisManager
    
    // Stage progress ranges (total = 100%)
    this.stageRanges = {
      ai_parsing: { start: 0, range: 40 },
      database_save: { start: 40, range: 20 },
      shopify_sync: { start: 60, range: 40 }
    }
    
    this.currentStage = null
    this.lastPublishedProgress = 0
  }
  
  /**
   * Set the current stage being processed
   */
  setStage(stage) {
    this.currentStage = stage
    this.lastPublishedProgress = 0
  }
  
  /**
   * Publish progress update
   * @param {number} localProgress - Progress within current stage (0-100)
   * @param {string} message - User-friendly message
   * @param {object} details - Additional details (chunk info, item counts, etc.)
   */
  async publishProgress(localProgress, message, details = {}) {
    if (!this.currentStage) {
      console.warn('⚠️ publishProgress called before setStage')
      return
    }
    
    const stageConfig = this.stageRanges[this.currentStage]
    if (!stageConfig) {
      console.warn(`⚠️ Unknown stage: ${this.currentStage}`)
      return
    }
    
    // Calculate global progress (0-100)
    const globalProgress = stageConfig.start + (localProgress / 100) * stageConfig.range
    const roundedProgress = Math.round(globalProgress)
    
    // Only publish if progress changed by at least 1%
    if (roundedProgress === this.lastPublishedProgress) {
      return
    }
    
    this.lastPublishedProgress = roundedProgress
    
    // Publish to Redis (which SSE will forward to frontend)
    await this.redisManager.publishMerchantProgress(this.merchantId, {
      poId: this.purchaseOrderId,
      workflowId: this.workflowId,
      stage: this.currentStage,
      progress: roundedProgress,
      message,
      ...details
    })
    
    console.log(`📊 Progress: ${roundedProgress}% - ${message}`, details)
  }
  
  /**
   * Helper for linear progress (e.g., processing N items)
   * @param {number} current - Current item index (0-based)
   * @param {number} total - Total items
   * @param {string} itemName - Name of item being processed
   */
  async publishLinearProgress(current, total, itemName) {
    const localProgress = total > 0 ? ((current + 1) / total) * 100 : 100
    const message = `Processing ${itemName} ${current + 1}/${total}`
    
    await this.publishProgress(localProgress, message, {
      current: current + 1,
      total,
      itemName
    })
  }
}
```

### **Step 2: Integrate into Workflow Orchestrator** (1 hour)

```javascript
// api/src/lib/workflowOrchestrator.js

async processAIParsing(job) {
  // ... existing setup ...
  
  // Create progress helper
  const progressHelper = new ProgressHelper({
    merchantId,
    purchaseOrderId,
    workflowId,
    redisManager: redisManagerInstance
  })
  
  progressHelper.setStage('ai_parsing')
  
  try {
    // Initial progress
    await progressHelper.publishProgress(5, 'Starting AI parsing')
    
    // Pass progress helper to AI service
    const aiResult = await enhancedAIService.parseDocument(
      aiServiceInput, 
      workflowId, 
      {
        fileName,
        fileType: fileExtension,
        mimeType,
        progressHelper // <-- NEW
      }
    )
    
    // ... rest of processing ...
  }
}
```

### **Step 3: Add PDF Parsing Progress** (2 hours)

```javascript
// api/src/lib/fileParsingService.js

async parseFile(buffer, mimeType, fileName, options = {}) {
  const { progressHelper } = options
  
  if (mimeType === 'application/pdf') {
    return await this.parsePDF(buffer, fileName, progressHelper)
  }
  // ... other types ...
}

async parsePDF(buffer, fileName, progressHelper) {
  try {
    // Load PDF
    const pdfData = await pdfParse(buffer)
    
    if (progressHelper) {
      // PDF parsing is 0-20% of AI parsing stage (which is 0-40% of total)
      // So local progress 0-100 maps to global 0-8%
      
      // Simulate page-by-page parsing progress
      const pageCount = pdfData.numpages
      
      for (let i = 0; i < pageCount; i++) {
        const localProgress = ((i + 1) / pageCount) * 100
        await progressHelper.publishProgress(
          localProgress * 0.2, // 20% of stage
          `Parsing page ${i + 1}/${pageCount}`,
          { currentPage: i + 1, totalPages: pageCount }
        )
      }
    }
    
    return {
      success: true,
      text: pdfData.text,
      pages: pdfData.numpages,
      // ...
    }
  } catch (error) {
    // ...
  }
}
```

### **Step 4: Add OpenAI Chunk Processing Progress** (3 hours)

```javascript
// api/src/lib/enhancedAIService.js

async parseDocument(fileContent, workflowId, options = {}) {
  const { progressHelper } = options
  
  // Store for use in chunking
  this.progressHelper = progressHelper
  
  // ... existing code ...
}

async _processLargeDocument(text) {
  // ... existing chunking code ...
  
  const chunks = [/* ... */]
  
  console.log(`📄 Created ${chunks.length} chunks for processing`)
  
  if (this.progressHelper) {
    await this.progressHelper.publishProgress(
      15, // 15% = chunking complete
      `Created ${chunks.length} chunks for AI processing`,
      { chunkCount: chunks.length, totalChars: text.length }
    )
  }
  
  // Process first chunk
  if (this.progressHelper) {
    await this.progressHelper.publishProgress(
      17, // 15% + 2%
      `Processing chunk 1/${chunks.length} with OpenAI API...`,
      { currentChunk: 1, totalChunks: chunks.length }
    )
  }
  
  const firstResponse = await openai.chat.completions.create({/* ... */})
  
  // Extract line items from first chunk
  let lineItemsExtracted = 0
  try {
    const firstResult = JSON.parse(this._stripMarkdownCodeBlocks(firstResponse.choices[0]?.message?.content))
    lineItemsExtracted = firstResult.lineItems?.length || 0
    
    if (this.progressHelper) {
      await this.progressHelper.publishProgress(
        22, // 15% + 7% (first chunk complete)
        `Chunk 1/${chunks.length} complete: extracted ${lineItemsExtracted} items`,
        { 
          currentChunk: 1, 
          totalChunks: chunks.length,
          lineItemsExtracted
        }
      )
    }
  } catch (error) {
    console.warn('⚠️ Could not parse first chunk')
  }
  
  // Process remaining chunks
  for (let i = 1; i < chunks.length; i++) {
    if (this.progressHelper) {
      // Progress: 22% + ((i / chunks.length) * 13%)
      // Chunk 2/3 → 22% + (1/3 * 13%) = 26.33%
      // Chunk 3/3 → 22% + (2/3 * 13%) = 30.67%
      const baseProgress = 22
      const chunkProgress = (i / chunks.length) * 13
      
      await this.progressHelper.publishProgress(
        baseProgress + chunkProgress,
        `Processing chunk ${i + 1}/${chunks.length} with OpenAI API...`,
        { currentChunk: i + 1, totalChunks: chunks.length }
      )
    }
    
    const chunkResponse = await this._processChunk(chunks[i], i + 1, chunks.length)
    
    // Extract line items count
    try {
      const chunkResult = JSON.parse(this._stripMarkdownCodeBlocks(chunkResponse.choices[0]?.message?.content))
      const chunkLineItems = chunkResult.lineItems?.length || 0
      lineItemsExtracted += chunkLineItems
      
      if (this.progressHelper) {
        await this.progressHelper.publishProgress(
          22 + ((i + 1) / chunks.length) * 13,
          `Chunk ${i + 1}/${chunks.length} complete: extracted ${chunkLineItems} items`,
          { 
            currentChunk: i + 1, 
            totalChunks: chunks.length,
            chunkLineItems,
            totalLineItems: lineItemsExtracted
          }
        )
      }
    } catch (error) {
      console.warn(`⚠️ Could not parse chunk ${i + 1}`)
    }
  }
  
  // Merging results
  if (this.progressHelper) {
    await this.progressHelper.publishProgress(
      35,
      `Merging ${lineItemsExtracted} items from ${chunks.length} chunks`,
      { totalLineItems: lineItemsExtracted, chunkCount: chunks.length }
    )
  }
  
  // ... existing merging code ...
}
```

### **Step 5: Add Database Save Progress** (2 hours)

```javascript
// api/src/lib/workflowOrchestrator.js

async processDatabaseSave(job) {
  // ... existing setup ...
  
  const progressHelper = new ProgressHelper({
    merchantId,
    purchaseOrderId,
    workflowId,
    redisManager: redisManagerInstance
  })
  
  progressHelper.setStage('database_save')
  
  try {
    await progressHelper.publishProgress(5, 'Validating AI results')
    
    // ... validation code ...
    
    await progressHelper.publishProgress(10, 'Starting database persistence')
    
    // Save AI results
    const dbResult = await this.dbService.persistAIResults(
      aiResult,
      merchantId,
      fileName,
      {
        uploadId,
        workflowId,
        purchaseOrderId,
        source: 'automatic_processing',
        progressHelper // <-- NEW
      }
    )
    
    await progressHelper.publishProgress(
      95,
      `Saved ${dbResult.lineItems?.length || 0} line items successfully`,
      { lineItemCount: dbResult.lineItems?.length }
    )
    
    // ... rest of processing ...
  }
}
```

```javascript
// api/src/lib/dbService.js

async persistAIResults(aiResult, merchantId, fileName, options = {}) {
  const { progressHelper } = options
  
  // ... existing validation ...
  
  const lineItems = extractedData.lineItems || []
  
  // Create PO
  const purchaseOrder = await prisma.purchaseOrder.create({/* ... */})
  
  if (progressHelper) {
    await progressHelper.publishProgress(
      20,
      'Purchase order created, saving line items...',
      { lineItemCount: lineItems.length }
    )
  }
  
  // Save line items with progress tracking
  const savedLineItems = []
  
  for (let i = 0; i < lineItems.length; i++) {
    const lineItem = lineItems[i]
    
    const saved = await prisma.lineItem.create({
      data: {
        purchaseOrderId: purchaseOrder.id,
        // ... line item data ...
      }
    })
    
    savedLineItems.push(saved)
    
    // Update progress every 5 items or on last item
    if (progressHelper && (i % 5 === 0 || i === lineItems.length - 1)) {
      // Progress: 20% + (i / total * 70%)
      const localProgress = 20 + ((i + 1) / lineItems.length) * 70
      await progressHelper.publishProgress(
        localProgress,
        `Saved ${i + 1}/${lineItems.length} line items`,
        { 
          savedCount: i + 1,
          totalCount: lineItems.length,
          currentItem: lineItem.description || 'Item'
        }
      )
    }
  }
  
  if (progressHelper) {
    await progressHelper.publishProgress(
      95,
      `All ${savedLineItems.length} line items saved successfully`,
      { lineItemCount: savedLineItems.length }
    )
  }
  
  return {
    purchaseOrder,
    lineItems: savedLineItems
  }
}
```

---

## 📊 Progress Distribution (Final)

### Total Progress Breakdown (0-100%)

| Stage | Range | Sub-Stages | Update Frequency |
|-------|-------|------------|------------------|
| **AI Parsing** | 0-40% | 8 sub-stages | Every 1-2% |
| **Database Save** | 40-60% | 3 sub-stages | Every 5 items or 2% |
| **Shopify Sync** | 60-100% | 3 sub-stages | Every product or 4% |

### Detailed Breakdown

**AI Parsing (0-40%):**
- 0-8%: PDF parsing (per page)
- 8-12%: Text extraction
- 12-15%: Document chunking
- 15-35%: OpenAI chunk processing (per chunk)
  - Chunk 1: 15-22%
  - Chunk 2: 22-29%
  - Chunk 3: 29-35%
- 35-40%: Result merging

**Database Save (40-60%):**
- 40-45%: Validation
- 45-55%: Line item persistence (per item)
- 55-60%: Relationship creation

**Shopify Sync (60-100%):**
- 60-70%: Product matching
- 70-90%: Inventory updates (per product)
- 90-100%: Order creation

---

## 🎨 Frontend UI Updates

### Progress Bar Enhancement

**Before:**
```tsx
<Progress value={50} />
<p>AI parsing...</p>
```

**After:**
```tsx
<Progress value={67} />
<div className="space-y-1">
  <p className="font-medium">Processing chunk 2/3</p>
  <p className="text-xs text-slate-600">Extracted 3 line items</p>
</div>
```

### Activity Feed Enhancement

**Before:**
```tsx
{
  type: 'processing',
  message: 'Processing purchase order',
  timestamp: Date.now()
}
```

**After:**
```tsx
{
  type: 'progress',
  message: 'Processing chunk 2/3 (67%)',
  details: 'Extracted 3 line items from chunk',
  progress: 67,
  timestamp: Date.now()
}
```

---

## 🧪 Testing Strategy

### Unit Tests
```javascript
describe('ProgressHelper', () => {
  it('should calculate global progress correctly', async () => {
    const helper = new ProgressHelper({...})
    helper.setStage('ai_parsing')
    
    // Local 50% of ai_parsing (0-40% range) → Global 20%
    await helper.publishProgress(50, 'Test')
    expect(lastPublishedProgress).toBe(20)
  })
  
  it('should only publish when progress changes by 1%', async () => {
    const helper = new ProgressHelper({...})
    helper.setStage('ai_parsing')
    
    await helper.publishProgress(50.4, 'Test 1') // → 20%
    await helper.publishProgress(50.6, 'Test 2') // → 20% (no publish)
    
    expect(publishCount).toBe(1)
  })
})
```

### Integration Tests
```javascript
describe('Granular Progress', () => {
  it('should publish progress during chunk processing', async () => {
    const progressEvents = []
    
    // Mock Redis subscriber
    subscriber.on('message', (channel, msg) => {
      progressEvents.push(JSON.parse(msg))
    })
    
    // Upload 5-page PDF
    await uploadPO('test-5page.pdf')
    
    // Wait for processing
    await waitForCompletion()
    
    // Should have received granular updates
    expect(progressEvents.length).toBeGreaterThan(10)
    expect(progressEvents.some(e => e.message.includes('chunk'))).toBe(true)
    expect(progressEvents.some(e => e.message.includes('page'))).toBe(true)
  })
})
```

### Manual Testing Checklist
- [ ] Upload 1-page PDF → See "Parsing page 1/1"
- [ ] Upload 5-page PDF → See "Parsing page 1/5" through "Parsing page 5/5"
- [ ] Upload large PDF (3 chunks) → See "Processing chunk 1/3", "chunk 2/3", "chunk 3/3"
- [ ] Check progress increments are 1-2% (not 40% jumps)
- [ ] Verify activity feed shows detailed messages
- [ ] Check SSE events arrive in <1 second

---

## 🚀 Deployment Plan

### Phase 2A: PDF & Chunking Progress (Week 1)
- ✅ Create ProgressHelper class
- ✅ Add PDF page-by-page progress
- ✅ Add chunking progress
- ✅ Test with small/medium/large PDFs

### Phase 2B: OpenAI Chunk Progress (Week 2)
- ✅ Add chunk-by-chunk OpenAI progress
- ✅ Add line item extraction counts
- ✅ Add result merging progress
- ✅ Test with multi-chunk documents

### Phase 2C: Database Progress (Week 3)
- ✅ Add line item save progress
- ✅ Add validation progress
- ✅ Test with 1, 5, 20, 50+ line items

### Phase 2D: Shopify Progress (Week 4)
- ✅ Add product matching progress
- ✅ Add inventory update progress
- ✅ Test end-to-end

---

## 📈 Expected Impact

### User Experience
- **Before:** 30-60 second black box ("50% complete")
- **After:** Continuous feedback every 1-2 seconds
- **Perceived Speed:** 2-3x faster (psychological)

### Support Tickets
- **Before:** "Is it stuck?" questions
- **After:** Users can see exactly what's happening
- **Expected Reduction:** 60-80%

### Confidence
- **Before:** "Hope it works..."
- **After:** "I can see it's working on chunk 2/3"
- **Trust Increase:** Significant

---

## ✅ Success Criteria

### Technical
- [ ] Progress updates every 1-2%
- [ ] <1 second between updates
- [ ] No performance degradation
- [ ] SSE events include detailed metadata

### User Experience
- [ ] Users see "Processing chunk X/Y"
- [ ] Users see "Parsing page X/Y"
- [ ] Users see "Saved X/Y items"
- [ ] Progress bar moves smoothly

### Quality
- [ ] Zero stuck workflows
- [ ] Progress always increases (never goes backward)
- [ ] 100% completion matches stage completion
- [ ] No duplicate progress events

---

## 🎯 Next Steps

1. **Review this analysis** with team
2. **Approve implementation plan** and timeline
3. **Create Jira tickets** for each step
4. **Start with ProgressHelper** (foundation)
5. **Roll out incrementally** (PDF → Chunks → Database → Shopify)

**Estimated Total Effort:** 8-10 development hours (2-3 days)  
**Risk Level:** Low (additive changes, no breaking changes)  
**User Impact:** HIGH (major UX improvement)

---

**Ready to implement?** Let's start with Step 1: ProgressHelper class! 🚀
