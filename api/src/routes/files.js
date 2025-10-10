/**
 * File serving routes for documents
 */

import express from 'express'
import { db } from '../lib/db.js'
import { storageService } from '../lib/storageService.js'

const router = express.Router()

// GET /api/files/po/:purchaseOrderId - Serve PO document content
router.get('/po/:purchaseOrderId', async (req, res) => {
  try {
    const { purchaseOrderId } = req.params
    
    const prisma = await db.getClient()

    // Get PurchaseOrder record from database
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId }
    })
    
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }
    
    if (!purchaseOrder.fileUrl) {
      return res.status(404).json({
        success: false,
        error: 'File not available for this purchase order'
      })
    }
    
    // Extract storage key from fileUrl (assuming it's a storage key or contains one)
    const storageKey = purchaseOrder.fileUrl
    
    // Download file from storage
    const downloadResult = await storageService.downloadFile(storageKey)
    
    if (!downloadResult.success || !downloadResult.buffer) {
      return res.status(404).json({
        success: false,
        error: 'File content not available'
      })
    }
    
    // Determine content type based on file extension
    let contentType = 'application/octet-stream'
    const fileName = purchaseOrder.fileName || 'document'
    const extension = fileName.toLowerCase().split('.').pop()
    
    switch (extension) {
      case 'pdf':
        contentType = 'application/pdf'
        break
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg'
        break
      case 'png':
        contentType = 'image/png'
        break
      case 'gif':
        contentType = 'image/gif'
        break
      case 'webp':
        contentType = 'image/webp'
        break
      case 'csv':
        contentType = 'text/csv'
        break
    }
    
    // Set appropriate headers
    res.set({
      'Content-Type': contentType,
      'Content-Length': downloadResult.buffer.length,
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
    })
    
    // Send file content
    res.send(downloadResult.buffer)
    
  } catch (error) {
    console.error('Error serving purchase order file:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to serve file'
    })
  }
})

// GET /api/files/po/:purchaseOrderId/download - Force download of PO document
router.get('/po/:purchaseOrderId/download', async (req, res) => {
  try {
    const { purchaseOrderId } = req.params
    
    const prisma = await db.getClient()

    // Get PurchaseOrder record from database
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId }
    })
    
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }
    
    if (!purchaseOrder.fileUrl) {
      return res.status(404).json({
        success: false,
        error: 'File not available for this purchase order'
      })
    }
    
    // Extract storage key from fileUrl
    const storageKey = purchaseOrder.fileUrl
    
    // Download file from storage
    const downloadResult = await storageService.downloadFile(storageKey)
    
    if (!downloadResult.success || !downloadResult.buffer) {
      return res.status(404).json({
        success: false,
        error: 'File content not available'
      })
    }
    
    // Determine content type based on file extension
    let contentType = 'application/octet-stream'
    const fileName = purchaseOrder.fileName || 'document'
    const extension = fileName.toLowerCase().split('.').pop()
    
    switch (extension) {
      case 'pdf':
        contentType = 'application/pdf'
        break
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg'
        break
      case 'png':
        contentType = 'image/png'
        break
      case 'gif':
        contentType = 'image/gif'
        break
      case 'webp':
        contentType = 'image/webp'
        break
      case 'csv':
        contentType = 'text/csv'
        break
    }
    
    // Set headers for download
    res.set({
      'Content-Type': contentType,
      'Content-Length': downloadResult.buffer.length,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-cache'
    })
    
    // Send file content
    res.send(downloadResult.buffer)
    
  } catch (error) {
    console.error('Error downloading purchase order file:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to download file'
    })
  }
})

// GET /api/files/:uploadId - Serve file content (legacy support for Upload model)
router.get('/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params
    
    const prisma = await db.getClient()

    // Get upload record from database
    const upload = await prisma.upload.findUnique({
      where: { id: uploadId }
    })
    
    if (!upload) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      })
    }
    
    // Download file from storage
    const downloadResult = await storageService.downloadFile(upload.fileUrl)
    
    if (!downloadResult.success || !downloadResult.buffer) {
      return res.status(404).json({
        success: false,
        error: 'File content not available'
      })
    }
    
    // Determine content type based on file extension
    let contentType = 'application/octet-stream'
    const fileName = upload.originalFileName || 'document'
    const extension = fileName.toLowerCase().split('.').pop()
    
    switch (extension) {
      case 'pdf':
        contentType = 'application/pdf'
        break
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg'
        break
      case 'png':
        contentType = 'image/png'
        break
      case 'gif':
        contentType = 'image/gif'
        break
      case 'webp':
        contentType = 'image/webp'
        break
      case 'csv':
        contentType = 'text/csv'
        break
    }
    
    // Set appropriate headers
    res.set({
      'Content-Type': contentType,
      'Content-Length': downloadResult.buffer.length,
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
    })
    
    // Send file content
    res.send(downloadResult.buffer)
    
  } catch (error) {
    console.error('Error serving file:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to serve file'
    })
  }
})

export default router