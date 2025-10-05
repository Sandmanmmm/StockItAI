import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://omvdgqbmgxxutbjhnamf.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_MOUSOnPrPHPv3ObEclRNJA_NStX30aL'

// Create Supabase client for frontend
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

// Database table names
export const TABLES = {
  PURCHASE_ORDERS: 'PurchaseOrder',
  SUPPLIERS: 'Supplier',
  LINE_ITEMS: 'POLineItem',
  PRODUCTS: 'ProductDraft',
  SETTINGS: 'AISettings',
  WORKFLOW_LOGS: 'WorkflowLog'
} as const

// Realtime channel names
export const CHANNELS = {
  PURCHASE_ORDERS: 'purchase_orders_channel',
  QUEUE_STATUS: 'queue_status_channel',
  ACTIVITY_FEED: 'activity_feed_channel'
} as const
