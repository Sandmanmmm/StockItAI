/**
 * Supabase Storage Service for File Management
 * Handles secure file upload, retrieval, and organization in Supabase Storage
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') })

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for storage operations

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Supabase credentials not found. File storage will use fallback mode.')
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
}) : null

export class SupabaseStorageService {
  constructor() {
    this.bucketName = 'purchase-orders'
    this.isAvailable = !!supabase
  }

  /**
   * Initialize storage bucket if it doesn't exist
   */
  async initializeBucket() {
    if (!this.isAvailable) {
      console.warn('Supabase not available, skipping bucket initialization')
      return false
    }

    try {
      // Check if bucket exists
      const { data: buckets, error: listError } = await supabase.storage.listBuckets()
      
      if (listError) {
        console.error('Error listing buckets:', listError)
        return false
      }

      const bucketExists = buckets.some(bucket => bucket.name === this.bucketName)
      
      if (!bucketExists) {
        // Create bucket with proper policies
        const { error: createError } = await supabase.storage.createBucket(this.bucketName, {
          public: false, // Private bucket for security
          allowedMimeTypes: [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/jpg',
            'image/webp',
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          ],
          fileSizeLimit: 25 * 1024 * 1024 // 25MB limit
        })

        if (createError) {
          console.error('Error creating bucket:', createError)
          return false
        }

        console.log(`✅ Created storage bucket: ${this.bucketName}`)
      }

      return true
    } catch (error) {
      console.error('Error initializing bucket:', error)
      return false
    }
  }

  /**
   * Upload file to Supabase Storage
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} fileName - Original file name
   * @param {string} merchantId - Merchant ID for folder organization
   * @param {string} poId - Purchase order ID
   * @param {string} mimeType - File MIME type
   * @returns {Promise<{success: boolean, fileUrl?: string, filePath?: string, error?: string}>}
   */
  async uploadFile(fileBuffer, fileName, merchantId, poId, mimeType) {
    if (!this.isAvailable) {
      return {
        success: false,
        error: 'Supabase storage not available'
      }
    }

    try {
      await this.initializeBucket()

      // Generate secure file path
      const fileExtension = path.extname(fileName)
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
      const timestamp = Date.now()
      const filePath = `${merchantId}/${poId}/${timestamp}_${sanitizedFileName}`

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .upload(filePath, fileBuffer, {
          contentType: mimeType,
          upsert: false
        })

      if (error) {
        console.error('Error uploading file:', error)
        return {
          success: false,
          error: error.message
        }
      }

      // Generate signed URL for secure access (24-hour expiry)
      const { data: urlData, error: urlError } = await supabase.storage
        .from(this.bucketName)
        .createSignedUrl(filePath, 24 * 60 * 60) // 24 hours

      if (urlError) {
        console.error('Error creating signed URL:', urlError)
        return {
          success: false,
          error: urlError.message
        }
      }

      return {
        success: true,
        fileUrl: urlData.signedUrl,
        filePath: filePath,
        publicUrl: `${supabaseUrl}/storage/v1/object/public/${this.bucketName}/${filePath}`
      }

    } catch (error) {
      console.error('Storage upload error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Get a fresh signed URL for an existing file
   * @param {string} filePath - Path to file in storage
   * @param {number} expiresIn - Expiry time in seconds (default 24 hours)
   * @returns {Promise<{success: boolean, signedUrl?: string, error?: string}>}
   */
  async getSignedUrl(filePath, expiresIn = 24 * 60 * 60) {
    if (!this.isAvailable) {
      return {
        success: false,
        error: 'Supabase storage not available'
      }
    }

    try {
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .createSignedUrl(filePath, expiresIn)

      if (error) {
        return {
          success: false,
          error: error.message
        }
      }

      return {
        success: true,
        signedUrl: data.signedUrl
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Download file from storage
   * @param {string} filePath - Path to file in storage
   * @returns {Promise<{success: boolean, buffer?: Buffer, error?: string}>}
   */
  async downloadFile(filePath) {
    if (!this.isAvailable) {
      return {
        success: false,
        error: 'Supabase storage not available'
      }
    }

    try {
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .download(filePath)

      if (error) {
        return {
          success: false,
          error: error.message
        }
      }

      const buffer = Buffer.from(await data.arrayBuffer())
      return {
        success: true,
        buffer
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Delete file from storage
   * @param {string} filePath - Path to file in storage
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteFile(filePath) {
    if (!this.isAvailable) {
      return {
        success: false,
        error: 'Supabase storage not available'
      }
    }

    try {
      const { error } = await supabase.storage
        .from(this.bucketName)
        .remove([filePath])

      if (error) {
        return {
          success: false,
          error: error.message
        }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * List files for a merchant
   * @param {string} merchantId - Merchant ID
   * @param {string} prefix - Optional path prefix
   * @returns {Promise<{success: boolean, files?: Array, error?: string}>}
   */
  async listFiles(merchantId, prefix = '') {
    if (!this.isAvailable) {
      return {
        success: false,
        error: 'Supabase storage not available'
      }
    }

    try {
      const path = prefix ? `${merchantId}/${prefix}` : merchantId
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .list(path)

      if (error) {
        return {
          success: false,
          error: error.message
        }
      }

      return {
        success: true,
        files: data
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Check if storage is available and properly configured
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    if (!this.isAvailable) {
      return false
    }

    try {
      // Try to list buckets as a health check
      const { data, error } = await supabase.storage.listBuckets()
      if (error) {
        console.error('Storage health check failed:', error)
        return false
      }
      return true
    } catch (error) {
      console.error('Storage health check failed:', error)
      return false
    }
  }
}

// Export singleton instance
export const storageService = new SupabaseStorageService()