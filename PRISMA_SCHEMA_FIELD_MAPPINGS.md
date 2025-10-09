# Prisma Schema Field Mappings

## ✅ Correct Field Names (As of 2025-10-09)

This document ensures all code uses the correct Prisma schema field names.

### WorkflowExecution Model

| ❌ WRONG Field | ✅ CORRECT Field | Notes |
|---------------|-----------------|-------|
| `error` | `errorMessage` | For error messages |
| `endTime` | `completedAt` | For completion timestamp |
| - | `startedAt` | For start timestamp (correct) |

**Correct Usage:**
```javascript
await prisma.workflowExecution.update({
  where: { workflowId },
  data: {
    status: 'completed',
    completedAt: new Date(),     // ✅ CORRECT
    errorMessage: 'Failed',       // ✅ CORRECT
  }
})
```

**Wrong Usage (DO NOT USE):**
```javascript
await prisma.workflowExecution.update({
  where: { workflowId },
  data: {
    endTime: new Date(),    // ❌ WRONG - No such field
    error: 'Failed',        // ❌ WRONG - Use errorMessage
  }
})
```

---

### Upload Model

| ❌ WRONG Field | ✅ CORRECT Field | Notes |
|---------------|-----------------|-------|
| `processedAt` | `updatedAt` | Upload doesn't have processedAt |
| - | `createdAt` | For creation timestamp (correct) |
| - | `errorMessage` | For error messages (correct) |

**Correct Usage:**
```javascript
await prisma.upload.update({
  where: { id: uploadId },
  data: {
    status: 'processed',
    updatedAt: new Date(),         // ✅ CORRECT (or omit - auto-updated)
    errorMessage: 'Failed to...'   // ✅ CORRECT
  }
})
```

**Wrong Usage (DO NOT USE):**
```javascript
await prisma.upload.update({
  where: { id: uploadId },
  data: {
    processedAt: new Date(),  // ❌ WRONG - No such field
  }
})
```

---

## 🔍 Files Fixed (Commit History)

### Fixed in process-upload-queue.js:
1. **Line 151**: `endTime` → `completedAt` (workflow completion)
2. **Line 161**: `processedAt` → `updatedAt` (upload status)
3. **Line 192**: `error` → `errorMessage` (workflow error - already fixed in commit a4de83c)

### Fixed in other commits:
- **a4de83c**: Fixed error→errorMessage, endTime→completedAt in error handling
- **324a796**: Fixed file buffer extraction (related fix)

---

## 🗄️ Complete Schema Reference

### WorkflowExecution
```prisma
model WorkflowExecution {
  id              String    @id @default(cuid())
  workflowId      String    @unique
  status          String    @default("pending")
  currentStage    String?
  startedAt       DateTime  @default(now())  // ✅ Use this
  completedAt     DateTime?                  // ✅ Use this (not endTime)
  errorMessage    String?                    // ✅ Use this (not error)
  failedStage     String?
  progressPercent Int       @default(0)
  // ... other fields
}
```

### Upload
```prisma
model Upload {
  id               String    @id @default(cuid())
  status           String    @default("uploaded")
  errorMessage     String?   // ✅ Use this
  createdAt        DateTime  @default(now())   // ✅ Use this
  updatedAt        DateTime  @updatedAt         // ✅ Use this (auto-updated)
  // ... other fields
  // ❌ No processedAt field exists
}
```

---

## 🚨 Common Mistakes to Avoid

1. **Don't use `endTime`** - Use `completedAt` for WorkflowExecution
2. **Don't use `processedAt`** on Upload - Use `updatedAt` or just rely on auto-update
3. **Don't use `error`** - Use `errorMessage` for both models
4. **Auto-updated fields**: `updatedAt` is automatically updated by Prisma, so you can often omit it

---

## ✅ Verification Checklist

Before committing code that updates these models:

- [ ] Replace `endTime` with `completedAt`
- [ ] Replace `error` with `errorMessage`
- [ ] Remove `processedAt` from Upload updates (use `updatedAt` or omit)
- [ ] Test with actual Prisma client (validation errors will catch issues)
- [ ] Check production logs for Prisma validation errors

---

**Last Updated**: 2025-10-09  
**Status**: All active files in process-upload-queue.js are now compliant ✅
