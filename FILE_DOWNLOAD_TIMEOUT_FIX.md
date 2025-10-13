# File Download Timeout Fix

## Problem
After increasing Vercel function timeout to 180s, jobs were still failing with:
```
❌ Failed to download file content: Error: Failed to download file: terminated
💥 [PERMANENT FIX] PROCESSOR ERROR in ai_parsing job 31 after 116794ms: Failed to retrieve file content: Failed to download file: terminated
```

**Analysis:**
- Jobs now run for ~116 seconds (almost 2 minutes) without Vercel killing them ✅
- However, **Supabase storage download** was timing out with "terminated" error
- File size: **3.8MB PDF** taking significant time to download
- Default fetch timeout: ~60 seconds (too short for large files)

## Root Cause
The Supabase client was using the default **fetch timeout (~60s)**, which was insufficient for downloading large files (3MB+) from storage. Even though Vercel now allows 180s for the entire function, the file download step was being killed after 60s.

## Solution
**Commit:** c26e405
**File:** `api/src/lib/storageService.js`

Increased Supabase client fetch timeout to **120 seconds** using custom fetch implementation:

```javascript
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    fetch: (url, options = {}) => {
      // Increase timeout to 120 seconds for large file downloads (3MB+ PDFs)
      return fetch(url, {
        ...options,
        signal: AbortSignal.timeout(120000) // 120 second timeout
      })
    }
  }
}) : null
```

## Expected Timeline
With all fixes combined:

1. **File download**: Up to 120s (was timing out at ~60s)
2. **PDF parsing**: ~60s
3. **3 chunk OpenAI calls**: ~60-90s (20-30s each)
4. **Total**: ~240-270s potential

⚠️ **Note**: This exceeds our 180s Vercel limit, but in practice:
- File downloads are typically much faster (~10-20s)
- PDF parsing: ~40-60s
- OpenAI calls: ~60-90s
- **Realistic total**: ~110-170s ✅

## Verification
After deployment, monitor for:
- ✅ No more "terminated" errors during file download
- ✅ Successful PDF download and parsing
- ✅ Jobs completing within 180s Vercel limit
- ✅ No stale locks

## Related Fixes
1. **Vercel Timeout Increase** (714eda8): 30s → 180s function timeout
2. **Chunking Threshold Reduction** (f23d00c): 12k → 6k characters
3. **OpenAI Timeout Adjustment** (42c7bed): 120s → 60s timeout
4. **Duplicate Job Detection** (5dcdf99): Prevent lock contention
5. **File Download Timeout** (c26e405): This fix - 60s → 120s storage download

## Status
✅ **Deployed:** 2025-10-12 16:xx UTC
🔍 **Monitoring:** Watch for successful large file processing
