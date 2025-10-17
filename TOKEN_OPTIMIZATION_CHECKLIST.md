# ✅ Token Optimization Implementation Checklist

**Project**: Shopify PO Sync Pro  
**Objective**: Reduce AI parsing costs by 60-74% while increasing accuracy by 6%  
**Timeline**: 3 weeks (phased rollout)

---

## 📋 Pre-Implementation Setup

- [ ] Review `TOKEN_OPTIMIZATION_COMPREHENSIVE_ANALYSIS.md`
- [ ] Review `TOKEN_OPTIMIZATION_QUICKSTART.md`
- [ ] Review `TOKEN_OPTIMIZATION_VISUAL_GUIDE.md`
- [ ] Set up baseline metrics collection
  - [ ] Current average tokens per document
  - [ ] Current cost per document
  - [ ] Current accuracy rate
  - [ ] Current error rate
- [ ] Create backup branch: `git checkout -b feature/token-optimization`
- [ ] Set up monitoring dashboard for token metrics

---

## 🚀 Phase 1: Input Optimization (Week 1)

### Phase 1.1: Text Preprocessing (Day 1-2) ⚡ QUICK WIN

**Estimated Impact**: 40-60% token reduction, 0% accuracy change, $18/month savings

#### Setup
- [x] ✅ File created: `api/src/lib/textPreprocessor.js`
- [x] ✅ Test created: `api/src/tests/test-preprocessor.js`

#### Testing
- [ ] Run test suite: `node api/src/tests/test-preprocessor.js`
- [ ] Verify output shows 40%+ reduction
- [ ] Review cleaned text samples for quality

#### Integration
- [ ] Open `api/src/lib/enhancedAIService.js`
- [ ] Navigate to line 165 (PDF processing section)
- [ ] Add preprocessor import and integration (see QUICKSTART.md Step 2)
- [ ] Add logging for token reduction metrics
- [ ] Test with 5 production PDFs locally

#### Validation
- [ ] Deploy to staging environment
- [ ] Process 20 real POs through staging
- [ ] Compare results with baseline:
  - [ ] Token count reduced by 40-60%?
  - [ ] Accuracy maintained (>90%)?
  - [ ] No new errors introduced?
- [ ] Review processed output for quality

#### Deployment
- [ ] Commit changes: `git commit -m "feat: Add text preprocessing (Phase 1.1)"`
- [ ] Deploy to production (50% traffic)
- [ ] Monitor for 24 hours
- [ ] Full rollout if metrics are good

**Success Criteria**:
- ✅ 40%+ token reduction
- ✅ Accuracy ≥90%
- ✅ Error rate <5%
- ✅ No processing time increase

---

### Phase 1.2: Structured Output Schema (Day 3-4)

**Estimated Impact**: +15-20% additional reduction, +3-5% accuracy, $12/month additional savings

#### Implementation
- [ ] Create `getStructuredOutputSchema()` method in `enhancedAIService.js`
- [ ] Create `getHeaderSchema()` for chunked docs
- [ ] Create `getLineItemSchema()` for line items
- [ ] Replace `this.defaultPrompt` with `this.optimizedPrompt` (150 tokens)
- [ ] Update all OpenAI API calls to use structured output:
  - [ ] Line 208 (Vision API - keep image, add structured output)
  - [ ] Line 255 (CSV processing)
  - [ ] Line 637 (Text processing)
  - [ ] Line 751 (Large doc first chunk)
  - [ ] Line 799 (Large doc subsequent chunks)

#### Update API Calls
```javascript
// Template for updating each location
const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    { role: "user", content: `${this.optimizedPrompt}\n\n${text}` }
  ],
  functions: [this.getStructuredOutputSchema()],
  function_call: { name: "extract_purchase_order" },
  temperature: 0
})

// Parse structured output
const functionCall = response.choices[0].message.function_call
const parsedResult = JSON.parse(functionCall.arguments)
```

#### Testing
- [ ] Test with 10 PDFs (various formats)
- [ ] Test with 5 images
- [ ] Test with 3 CSVs
- [ ] Verify JSON structure compliance
- [ ] Check for malformed outputs

#### Validation
- [ ] Deploy to staging
- [ ] Process 50 POs
- [ ] Measure:
  - [ ] Total token reduction (target: 60-65%)
  - [ ] Accuracy improvement (target: +3-5%)
  - [ ] Schema compliance (target: 100%)

#### Deployment
- [ ] Commit: `git commit -m "feat: Add structured output schema (Phase 1.2)"`
- [ ] Deploy to production (75% traffic)
- [ ] Monitor for 48 hours
- [ ] Full rollout

**Success Criteria**:
- ✅ 60%+ total token reduction
- ✅ +3% accuracy improvement
- ✅ 100% valid JSON outputs
- ✅ Error rate <4%

---

### Phase 1.3: Few-Shot Prompting (Day 5)

**Estimated Impact**: +15-25% accuracy for ambiguous docs, +200 tokens cost (selective use)

#### Implementation
- [ ] Create `this.fewShotExamples` property with 2-3 examples
- [ ] Add conditional few-shot injection:
```javascript
if (options.useFewShot || confidenceThreshold > 0.85) {
  prompt = `${this.fewShotExamples}\n\n${this.optimizedPrompt}`
}
```
- [ ] Trigger few-shot only for:
  - [ ] Low-confidence documents (<0.7)
  - [ ] New supplier templates
  - [ ] Retry scenarios

#### Testing
- [ ] Test with 10 low-quality scans
- [ ] Test with 5 handwritten POs
- [ ] Test with 3 unusual formats
- [ ] Measure accuracy improvement

#### Validation
- [ ] Deploy to staging
- [ ] Process 30 "difficult" POs
- [ ] Measure accuracy gain on challenging docs

#### Deployment
- [ ] Commit: `git commit -m "feat: Add few-shot prompting (Phase 1.3)"`
- [ ] Deploy to production
- [ ] Monitor accuracy on edge cases

**Success Criteria**:
- ✅ +15% accuracy on ambiguous documents
- ✅ <5% increase in token usage overall
- ✅ Selective activation working correctly

**Phase 1 Complete**: 60-65% token reduction, +3-5% accuracy, $30/month savings

---

## 🔧 Phase 2: Chunking Optimization (Week 2)

### Phase 2.1: Intelligent Chunking (Day 1-3)

**Estimated Impact**: +5-10% additional reduction on large docs, +2% accuracy

#### Implementation
- [ ] Create `_processLargeDocumentOptimized()` method
- [ ] Implement header extraction (micro-prompt)
- [ ] Implement line-item extraction (micro-prompt)
- [ ] Create `createIntelligentChunks()` with smart split points
- [ ] Reduce overlap from 400 to 150 chars
- [ ] Increase chunk size from 3,200 to 4,000 chars

#### Testing
- [ ] Test with 20 large POs (>10,000 chars)
- [ ] Test with 10 multi-page PDFs (50+ line items)
- [ ] Verify no data loss at chunk boundaries
- [ ] Check deduplication works correctly

#### Validation
- [ ] Deploy to staging
- [ ] Process 100 large documents
- [ ] Measure:
  - [ ] Token reduction on large docs (target: 65-70%)
  - [ ] Line item accuracy (target: 100% capture)
  - [ ] No duplicate items

#### Deployment
- [ ] Commit: `git commit -m "feat: Intelligent chunking (Phase 2.1)"`
- [ ] Deploy to production
- [ ] Monitor chunking metrics

**Success Criteria**:
- ✅ 65-70% token reduction on large docs
- ✅ 100% line item capture
- ✅ Zero duplicate items
- ✅ 50% fewer API calls for large docs

---

### Phase 2.2: Prompt Caching (Day 4-5)

**Estimated Impact**: 50% reduction on cached input tokens

#### Implementation
- [ ] Add cache control to system messages:
```javascript
messages: [
  {
    role: "system",
    content: [
      {
        type: "text",
        text: this.optimizedPrompt,
        cache_control: { type: "ephemeral" }
      }
    ]
  },
  { role: "user", content: text }
]
```
- [ ] Implement cache hit tracking
- [ ] Add logging for cache performance

#### Testing
- [ ] Process 50 documents sequentially
- [ ] Measure cache hit rate
- [ ] Verify cost reduction on cached calls

#### Validation
- [ ] Deploy to staging
- [ ] Monitor cache hit rate (target: >50%)
- [ ] Measure cost reduction (target: 25% on average)

#### Deployment
- [ ] Commit: `git commit -m "feat: Prompt caching (Phase 2.2)"`
- [ ] Deploy to production
- [ ] Monitor cache metrics

**Success Criteria**:
- ✅ >50% cache hit rate
- ✅ 20-30% additional cost reduction
- ✅ No accuracy impact

**Phase 2 Complete**: 65-70% total token reduction, +5% accuracy, $50/month savings

---

## 🎯 Phase 3: Two-Stage Architecture (Week 3)

### Phase 3.1: Hybrid Model Implementation (Day 1-3)

**Estimated Impact**: 70-74% cost reduction, +6% accuracy, 75% fewer errors

#### Implementation
- [ ] Create `processTwoStage()` method
- [ ] Implement confidence threshold logic (0.85)
- [ ] Set up gpt-4o validation stage
- [ ] Add required fields check (`hasRequiredFields()`)
- [ ] Implement weighted cost tracking

#### Stage 1: Fast Extraction
```javascript
// gpt-4o-mini for initial extraction
const stage1Response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: `${this.optimizedPrompt}\n\n${text}` }],
  functions: [this.getStructuredOutputSchema()],
  function_call: { name: "extract_purchase_order" },
  temperature: 0
})
```

#### Stage 2: Validation (Conditional)
```javascript
// Only if confidence < 0.85 OR missing critical fields
if (extractedData.confidence < 0.85 || !this.hasRequiredFields(extractedData)) {
  const stage2Response = await openai.chat.completions.create({
    model: "gpt-4o", // Premium model
    messages: [...],
    functions: [this.getStructuredOutputSchema()],
    temperature: 0
  })
}
```

#### Testing
- [ ] Test with 100 documents
- [ ] Measure Stage 2 trigger rate (target: <30%)
- [ ] Verify accuracy improvement (target: +6%)
- [ ] Test with intentionally poor quality scans

#### Validation
- [ ] Deploy to staging
- [ ] Process 500 POs
- [ ] Measure:
  - [ ] Stage 2 trigger rate (target: <30%)
  - [ ] Overall accuracy (target: 98%)
  - [ ] Weighted average cost
  - [ ] Error rate (target: <2%)

#### Deployment
- [ ] Commit: `git commit -m "feat: Two-stage hybrid model (Phase 3.1)"`
- [ ] Deploy to production (A/B test 20% traffic)
- [ ] Monitor for 1 week
- [ ] Gradual rollout to 100%

**Success Criteria**:
- ✅ <30% Stage 2 trigger rate
- ✅ 98%+ accuracy
- ✅ 70%+ cost reduction
- ✅ <2% error rate

---

### Phase 3.2: Confidence-Based Routing (Day 4-5)

**Estimated Impact**: Further optimize Stage 2 usage

#### Implementation
- [ ] Add confidence score analysis
- [ ] Create confidence tier thresholds:
  - [ ] High (≥0.9): Skip Stage 2
  - [ ] Medium (0.7-0.9): Stage 2 for critical fields only
  - [ ] Low (<0.7): Full Stage 2 validation
- [ ] Implement per-field validation

#### Testing
- [ ] Test confidence tier routing
- [ ] Verify partial validation works
- [ ] Measure cost optimization

#### Validation
- [ ] Deploy to staging
- [ ] Process 200 POs
- [ ] Measure Stage 2 usage by tier

#### Deployment
- [ ] Commit: `git commit -m "feat: Confidence-based routing (Phase 3.2)"`
- [ ] Deploy to production
- [ ] Monitor tier distribution

**Success Criteria**:
- ✅ <25% Stage 2 trigger rate
- ✅ 98%+ accuracy maintained
- ✅ 74% total cost reduction

**Phase 3 Complete**: 74% token reduction, +6% accuracy, $63/month savings

---

## 📊 Final Validation & Monitoring

### Metrics Dashboard
- [ ] Set up real-time monitoring:
  - [ ] Average tokens per document (target: <3,000)
  - [ ] Cost per document (target: <$0.003)
  - [ ] Confidence score distribution
  - [ ] Stage 2 trigger rate
  - [ ] Processing duration
  - [ ] Error rate

### Performance Testing
- [ ] Load test with 1,000 documents
- [ ] Measure end-to-end latency
- [ ] Verify no degradation in processing speed
- [ ] Check rate limit handling

### Documentation
- [ ] Update API documentation
- [ ] Document optimization techniques used
- [ ] Create runbook for monitoring
- [ ] Document rollback procedures

---

## 🎉 Success Metrics Summary

### Target Achievements

| Metric | Baseline | Phase 1 | Phase 2 | Phase 3 | Target | Status |
|--------|----------|---------|---------|---------|--------|--------|
| **Tokens/Doc** | 8,500 | 5,100 | 3,400 | 2,200 | <3,000 | [ ] |
| **Cost/Doc** | $0.0085 | $0.0051 | $0.0034 | $0.0022 | <$0.003 | [ ] |
| **Accuracy** | 92% | 95% | 96% | 98% | >95% | [ ] |
| **Error Rate** | 8% | 7% | 4% | 2% | <3% | [ ] |
| **Monthly Cost** | $85 | $58 | $44 | $28 | <$40 | [ ] |

### Final Validation Checklist
- [ ] All phases deployed to production
- [ ] Monitoring shows sustained improvements
- [ ] No regressions in accuracy
- [ ] Cost savings confirmed in billing
- [ ] Error rate reduced by 75%
- [ ] Customer complaints reduced
- [ ] Documentation complete

---

## 🚨 Rollback Plan

If any phase shows issues:

1. **Immediate Rollback**:
   ```bash
   git checkout main
   git push production main --force
   ```

2. **Monitor Metrics**: Wait 1 hour, verify rollback successful

3. **Debug Issues**: Analyze logs, identify root cause

4. **Fix and Re-deploy**: Address issues, test thoroughly, re-deploy

---

## 📞 Support Resources

- **Comprehensive Analysis**: `TOKEN_OPTIMIZATION_COMPREHENSIVE_ANALYSIS.md`
- **Quick Start Guide**: `TOKEN_OPTIMIZATION_QUICKSTART.md`
- **Visual Guide**: `TOKEN_OPTIMIZATION_VISUAL_GUIDE.md`
- **Preprocessor Source**: `api/src/lib/textPreprocessor.js`
- **Test Suite**: `api/src/tests/test-preprocessor.js`

---

## ✅ Sign-Off

- [ ] Implementation complete
- [ ] All tests passing
- [ ] Metrics showing improvements
- [ ] Documentation updated
- [ ] Team trained on new system
- [ ] Monitoring in place

**Implemented by**: _______________  
**Date**: _______________  
**Final Token Reduction**: ___________%  
**Final Accuracy**: ___________%  
**Monthly Savings**: $___________

---

**🎯 Next Action**: Start with Phase 1.1 - Run the preprocessor test to see immediate results!

```bash
cd api
node src/tests/test-preprocessor.js
```
