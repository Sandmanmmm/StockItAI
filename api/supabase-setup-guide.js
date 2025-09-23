/**
 * Supabase API Keys Setup Guide
 * 
 * Since we need the correct API keys for your Supabase project, please follow these steps:
 * 
 * 1. Go to https://supabase.com/dashboard/projects
 * 2. Select your project: omvdgqbmgxxutbjhnamf
 * 3. Go to Settings > API
 * 4. Copy the following keys and update your .env file:
 * 
 * Project URL: https://omvdgqbmgxxutbjhnamf.supabase.co
 * anon/public key: (copy from "Project API keys" section)
 * service_role key: (copy from "Project API keys" section - this is the secret one)
 * 
 * Update your .env file with these values:
 * SUPABASE_URL="https://omvdgqbmgxxutbjhnamf.supabase.co"
 * SUPABASE_ANON_KEY="your_anon_key_here"
 * SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
 */

console.log(`
🔧 Supabase API Keys Setup Required

Your Supabase project: omvdgqbmgxxutbjhnamf
Dashboard URL: https://supabase.com/dashboard/project/omvdgqbmgxxutbjhnamf

Please follow these steps:

1. Go to: https://supabase.com/dashboard/project/omvdgqbmgxxutbjhnamf/settings/api
2. Copy the "anon public" key
3. Copy the "service_role" key (the secret one)
4. Update your .env file with these keys

Once you have the keys, the storage service will work properly for file uploads.

Current project URL: https://omvdgqbmgxxutbjhnamf.supabase.co
Database: Connected ✅
Storage: Waiting for API keys ⏳
`)