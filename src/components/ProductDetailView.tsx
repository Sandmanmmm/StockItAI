import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  ArrowLeft,
  Package,
  CurrencyDollar as DollarSign,
  Tag,
  Building,
  Image as ImageIcon,
  Barcode,
  Scales,
  Calculator,
  PencilSimple as Edit,
  FloppyDisk as Save,
  X,
  Check,
  Warning as AlertTriangle,
  TrendUp,
  ShoppingCart,
  MagicWand,
  Robot,
  ChartBar,
  Target,
  Clock,
  CheckCircle,
  XCircle,
  ClipboardText,
  SquaresFour,
  RocketLaunch
} from '@phosphor-icons/react'
import { authenticatedRequest } from '@/lib/shopifyApiService'
import { notificationService } from '@/lib/notificationService'

interface ProductItem {
  id: string
  sku: string
  name: string
  description?: string
  quantity: number
  unitPrice: number
  totalPrice: number
  confidence: number
  weight?: number
  barcode?: string
  category?: string
  vendor?: string
  // Add image-related fields
  images?: {
    vendorImages: any[]
    webScraped: any[]
    aiGenerated: any
    processed: any[]
    recommended: any
    needsReview: boolean
    reviewSessionId?: string
    totalImages: number
  }
}

interface ProductDraft {
  id: string
  sessionId: string
  merchantId: string
  purchaseOrderId: string
  lineItemId: string
  supplierId: string
  originalTitle: string
  refinedTitle?: string
  originalDescription?: string
  refinedDescription?: string
  originalPrice: number
  priceRefined?: number
  estimatedMargin?: number
  shopifyProductId?: string
  shopifyVariantId?: string
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SYNCING' | 'SYNCED' | 'FAILED'
  tags: string[]
  reviewNotes?: string
  reviewedBy?: string
  reviewedAt?: string
  // Shopify-specific fields
  productType?: string
  vendor?: string
  sku?: string
  compareAtPrice?: number
  costPerItem?: number
  inventoryQty?: number
  hsCode?: string
  countryOfOrigin?: string
  createdAt: string
  updatedAt: string
}

interface ProductDetailViewProps {
  item: ProductItem
  purchaseOrder: {
    id: string
    number: string
    supplierName: string
    currency: string
    supplier?: {
      id: string
      name: string
    }
  }
  merchantId: string
  onClose: () => void
  onSave: (updatedItem: ProductItem) => void
  onImageApproved?: () => void // NEW: Callback when images are approved
}

// Helper function to parse pack/case quantity from product title
function parsePackQuantity(title: string): number {
  // Match patterns like: "Pack of 12", "Case of 12", "12 Pack", "12-Pack", "12ct", "12 Count"
  const patterns = [
    /(?:pack|case|box)\s+of\s+(\d+)/i,
    /(\d+)\s*(?:pack|case|box|ct|count)/i,
    /(\d+)[-\s](?:pack|case|box|ct|count)/i
  ]
  
  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match && match[1]) {
      const qty = parseInt(match[1])
      if (qty > 1 && qty <= 1000) { // Reasonable range
        return qty
      }
    }
  }
  
  return 1 // Default to 1 if no pack quantity found
}

// Helper function to round price to 2 decimal places
// This ensures clean display after dividing per-pack prices by pack quantity
function roundPrice(price: number): number {
  return Math.round(price * 100) / 100
}

// Helper function to apply psychological pricing after division
// This maintains the refinement rules' rounding intent (e.g., .99 ending)
function applyPsychologicalRounding(price: number): number {
  // Round to 2 decimals first
  const rounded = Math.round(price * 100) / 100
  
  // If the price already ends in .99 or .95, keep it
  const cents = Math.round((rounded % 1) * 100)
  if (cents === 99 || cents === 95 || cents === 89) {
    return rounded
  }
  
  // For prices > $1, apply .99 ending
  if (rounded >= 1) {
    return Math.floor(rounded) + 0.99
  }
  
  // For prices < $1, just round to 2 decimals
  return rounded
}

export function ProductDetailView({ 
  item, 
  purchaseOrder, 
  merchantId, 
  onClose, 
  onSave,
  onImageApproved 
}: ProductDetailViewProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const imageApprovedCalledRef = useRef(false)

  // Image review state
  const [imageReviewSession, setImageReviewSession] = useState<any>(null)
  const [imageOptions, setImageOptions] = useState<any[]>([])
  const [selectedImages, setSelectedImages] = useState<{[key: string]: string[]}>({})
  const [loadingImages, setLoadingImages] = useState(false)
  const [uploadingCustomImage, setUploadingCustomImage] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)
  const [generatingTags, setGeneratingTags] = useState(false)

  // Editable fields
  const [editedTitle, setEditedTitle] = useState(item.name)
  const [editedDescription, setEditedDescription] = useState(item.description || '')
  // Calculate pack quantity first to use for pricing
  const packQuantity = parsePackQuantity(item.name)
  const [editedPrice, setEditedPrice] = useState(roundPrice(item.unitPrice / packQuantity))
  const [editedRetailPrice, setEditedRetailPrice] = useState(0) // Will be set from refined price
  const [editedTags, setEditedTags] = useState<string[]>([])
  const [editedCategory, setEditedCategory] = useState('')
  const [editedWeight, setEditedWeight] = useState(item.weight || 0)
  const [editedBarcode, setEditedBarcode] = useState(item.barcode || '')
  const [reviewNotes, setReviewNotes] = useState('')
  
  // Shopify-specific fields
  const [editedProductType, setEditedProductType] = useState('')
  const [editedVendor, setEditedVendor] = useState(purchaseOrder.supplierName || '')
  const [editedSku, setEditedSku] = useState(item.sku || '')
  const [editedCompareAtPrice, setEditedCompareAtPrice] = useState<number | undefined>(undefined)
  // Use pack quantity for per-unit pricing
  const [editedCostPerItem, setEditedCostPerItem] = useState(roundPrice(item.unitPrice / packQuantity))
  const [editedInventoryQty, setEditedInventoryQty] = useState((item.quantity || 0) * packQuantity)
  const [editedHsCode, setEditedHsCode] = useState('')
  const [editedCountryOfOrigin, setEditedCountryOfOrigin] = useState('')

  // Calculated values
  const margin = editedRetailPrice > editedPrice 
    ? ((editedRetailPrice - editedPrice) / editedRetailPrice) * 100 
    : 0
  const markup = editedPrice > 0 
    ? ((editedRetailPrice - editedPrice) / editedPrice) * 100 
    : 0

  useEffect(() => {
    // Reset the callback flag when component mounts or item changes
    console.log('🔄 ProductDetailView useEffect - resetting imageApprovedCalledRef to false')
    imageApprovedCalledRef.current = false
    loadOrCreateProductDraft()
    loadImageReviewData()
  }, [item.id])

  const loadImageReviewData = async () => {
    setLoadingImages(true)
    try {
      console.log('🔍 Loading image review data for PO:', purchaseOrder.id, 'Item:', item.name)
      
      // First, get the image review session for this purchase order
      const sessionResponse = await authenticatedRequest(
        `/api/image-review/sessions/by-purchase-order/${purchaseOrder.id}`,
        { method: 'GET' }
      )

      console.log('📦 Session Response:', sessionResponse)

      if (sessionResponse.success && sessionResponse.data) {
        const session = sessionResponse.data as any
        
        console.log('✅ Found image review session:', session.id)
        
        // Now get the dashboard data for this session
        const dashboardResponse = await authenticatedRequest(
          `/api/image-review/sessions/${session.id}`,
          { method: 'GET' }
        )

        console.log('📊 Dashboard Response:', dashboardResponse)

        if (dashboardResponse.success) {
          const sessionData = dashboardResponse.data as any
          setImageReviewSession(sessionData)
          
          console.log('📸 Image Review Session Data:', sessionData)
          console.log('📸 Products:', sessionData.products)
          console.log('📸 Looking for product with name:', item.name, 'SKU:', item.sku, 'ID:', item.id)
          
          // Log all products in the session for debugging
          if (sessionData.products && sessionData.products.length > 0) {
            console.log('📋 All products in session:')
            sessionData.products.forEach((p: any, idx: number) => {
              console.log(`  [${idx}] Name: "${p.productName}"`)
              console.log(`      SKU: "${p.productSku}"`)
              console.log(`      ID: "${p.id}"`)
              console.log(`      Original Data lineItemId: "${p.originalProductData?.lineItemId}"`)
            })
          }
          
          // Filter products to only show this product's images
          // Match by multiple criteria for better accuracy:
          // 1. Exact line item ID match from originalProductData (most reliable)
          // 2. Exact SKU match (very reliable)
          // 3. Product name contains or is contained in the item name (handles refined vs original titles)
          const matchingProducts = sessionData.products?.filter((product: any) => {
            console.log(`  🔍 Checking product: "${product.productName}"`)
            
            // First try line item ID match from originalProductData.lineItemId (not .id!)
            if (item.id && product.originalProductData?.lineItemId) {
              const originalLineItemId = product.originalProductData.lineItemId
              console.log(`    Comparing IDs: item.id="${item.id}" vs originalData.lineItemId="${originalLineItemId}"`)
              if (originalLineItemId === item.id) {
                console.log('    ✅ Matched by line item ID:', originalLineItemId)
                return true
              }
            }
            
            // Try exact SKU match
            if (item.sku && product.productSku) {
              console.log(`    Comparing SKUs: item.sku="${item.sku}" vs product.sku="${product.productSku}"`)
              if (product.productSku === item.sku) {
                console.log('    ✅ Matched by SKU:', product.productSku)
                return true
              }
            }
            
            // Try bidirectional name matching (to handle refined vs original titles)
            const productNameLower = (product.productName || '').toLowerCase()
            const itemNameLower = (item.name || '').toLowerCase()
            
            if (productNameLower && itemNameLower) {
              console.log(`    Comparing names: "${itemNameLower}" <-> "${productNameLower}"`)
              // Check if either name contains the other
              const nameMatch = productNameLower.includes(itemNameLower) || itemNameLower.includes(productNameLower)
              if (nameMatch) {
                console.log('    ✅ Matched by name:', product.productName, '<->', item.name)
                return true
              }
            }
            
            console.log('    ❌ No match')
            return false
          }) || []
          
          console.log('📸 Matching Products for', item.name, '(SKU:', item.sku, '):', matchingProducts)
          
          // Transform products into the format expected by the image display component
          const productItems = matchingProducts.map((product: any) => ({
            reviewItemId: product.id,
            productSku: product.productSku,
            productName: product.productName,
            imageOptions: product.images?.map((img: any) => ({
              id: img.id,
              url: img.imageUrl,
              type: img.imageType,
              source: img.source,
              altText: img.altText,
              isSelected: img.isSelected,
              isApproved: img.isApproved
            })) || []
          }))
          
          console.log('📸 Transformed Product Items:', productItems)
          console.log('📸 Image URLs:', productItems.flatMap((p: any) => p.imageOptions.map((i: any) => i.url)))
          
          setImageOptions(productItems)
          
          // Initialize selected images from current selections
          const initialSelections: {[key: string]: string[]} = {}
          productItems.forEach((dashboardItem: any) => {
            const selectedOptions = dashboardItem.imageOptions.filter((opt: any) => opt.isSelected)
            if (selectedOptions.length > 0) {
              initialSelections[dashboardItem.reviewItemId] = selectedOptions.map((opt: any) => opt.id)
            }
          })
          setSelectedImages(initialSelections)
        }
      } else {
        console.log('⚠️ No image review session found for purchase order:', purchaseOrder.id)
        
        // Fallback: Use images from item.images if available
        if (item.images?.processed && item.images.processed.length > 0) {
          console.log('📦 Using fallback images from item.images:', item.images.processed)
          const fallbackProductItems = [{
            reviewItemId: item.id,
            productSku: item.sku,
            productName: item.name,
            imageOptions: item.images.processed.map((img: any, index: number) => ({
              id: img.id || `fallback-${index}`,
              url: img.url || img.enhancedUrl || img.originalUrl,
              type: 'processed',
              source: 'product_draft',
              altText: img.altText || item.name,
              isSelected: index === 0, // Select first image by default
              isApproved: false
            }))
          }]
          
          setImageOptions(fallbackProductItems)
          
          // Select first image by default
          setSelectedImages({
            [item.id]: [fallbackProductItems[0].imageOptions[0].id]
          })
        }
      }
    } catch (error) {
      console.error('❌ Error loading image review data:', error)
      
      // Fallback on error: Use images from item.images if available
      if (item.images?.processed && item.images.processed.length > 0) {
        console.log('📦 Error fallback - using images from item.images:', item.images.processed)
        const fallbackProductItems = [{
          reviewItemId: item.id,
          productSku: item.sku,
          productName: item.name,
          imageOptions: item.images.processed.map((img: any, index: number) => ({
            id: img.id || `fallback-${index}`,
            url: img.url || img.enhancedUrl || img.originalUrl,
            type: 'processed',
            source: 'product_draft',
            altText: img.altText || item.name,
            isSelected: index === 0,
            isApproved: false
          }))
        }]
        
        setImageOptions(fallbackProductItems)
        setSelectedImages({
          [item.id]: [fallbackProductItems[0].imageOptions[0].id]
        })
      }
    } finally {
      setLoadingImages(false)
    }
  }

  const loadOrCreateProductDraft = async () => {
    setLoading(true)
    try {
      // First, try to find existing product draft
      const response = await authenticatedRequest(
        `/api/product-drafts/by-line-item/${item.id}`,
        { method: 'GET' }
      )

      if (response.success && response.data) {
        const draft = response.data as ProductDraft
        setProductDraft(draft)
        
        // Calculate pack quantity from title for per-unit pricing
        const draftPackQuantity = parsePackQuantity(draft.refinedTitle || draft.originalTitle)
        
        setEditedTitle(draft.refinedTitle || draft.originalTitle)
        setEditedDescription(draft.refinedDescription || draft.originalDescription || '')
        // Divide prices by pack quantity to get per-unit price, then round
        // Use simple rounding for cost prices
        setEditedPrice(roundPrice(draft.originalPrice / draftPackQuantity))
        // Use psychological rounding for retail price (customer-facing)
        setEditedRetailPrice(applyPsychologicalRounding((draft.priceRefined || draft.originalPrice * 1.5) / draftPackQuantity))
        setEditedTags(draft.tags || [])
        setReviewNotes(draft.reviewNotes || '')
        
        // Load Shopify-specific fields
        setEditedProductType(draft.productType || '')
        setEditedVendor(draft.vendor || purchaseOrder.supplierName || '')
        setEditedSku(draft.sku || item.sku || '')
        setEditedCompareAtPrice(draft.compareAtPrice ? applyPsychologicalRounding(draft.compareAtPrice / draftPackQuantity) : undefined)
        setEditedCostPerItem(draft.costPerItem ? roundPrice(draft.costPerItem / draftPackQuantity) : roundPrice(draft.originalPrice / draftPackQuantity))
        // If draft has inventory, use it; otherwise calculate from PO quantity × pack size
        const calculatedInventory = (item.quantity || 0) * draftPackQuantity
        setEditedInventoryQty(draft.inventoryQty || calculatedInventory)
        setEditedHsCode(draft.hsCode || '')
        setEditedCountryOfOrigin(draft.countryOfOrigin || '')
      } else {
        // Create new product draft if it doesn't exist
        await createProductDraft()
      }
    } catch (error) {
      console.error('Error loading product draft:', error)
      notificationService.showError('Failed to load product details', 'Please try again later')
    } finally {
      setLoading(false)
    }
  }

  const createProductDraft = async () => {
    try {
      // First get refined pricing from the refinement engine
      let refinedPrice = item.unitPrice * 1.5; // Fallback
      let estimatedMargin = 33.33; // Default fallback
      let appliedRules = '';

      console.log('=== CREATE PRODUCT DRAFT ===');
      console.log('Creating product draft for item:', item.name, 'Price:', item.unitPrice);
      console.log('Merchant ID:', merchantId);

      // Test the refinement API
      console.log('Calling refinement API...');
      const testUrl = `/api/refinement-config/test-pricing?merchantId=${merchantId}`;
      console.log('API URL:', testUrl);
      
      const testBody = {
        sampleProduct: {
          name: item.name,
          description: item.description,
          price: item.unitPrice,
          category: item.category,
          vendor: item.vendor
        }
      };
      console.log('API Body:', testBody);

      try {
        const refinementResponse = await fetch(testUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testBody)
        });

        console.log('Refinement API Response Status:', refinementResponse.status);
        
        if (refinementResponse.ok) {
          const responseData = await refinementResponse.json();
          console.log('Refinement API Response Data:', responseData);
          
          if (responseData.success && responseData.data) {
            const data = responseData.data as any;
            refinedPrice = data.adjustedPrice || refinedPrice;
            const markup = data.markup || 0;
            estimatedMargin = item.unitPrice > 0 ? ((refinedPrice - item.unitPrice) / refinedPrice) * 100 : estimatedMargin;
            appliedRules = data.appliedRules?.map((rule: any) => rule.description).join(', ') || '';
            console.log('SUCCESS - Refined pricing result:', {
              original: item.unitPrice,
              refined: refinedPrice,
              margin: estimatedMargin,
              rules: appliedRules
            });
          } else {
            console.error('Refinement API returned unsuccessful response:', responseData);
            alert(`Refinement API Error: ${JSON.stringify(responseData)}`);
          }
        } else {
          const errorText = await refinementResponse.text();
          console.error('Refinement API request failed:', refinementResponse.status, errorText);
          alert(`Refinement API Failed: ${refinementResponse.status} - ${errorText}`);
        }
      } catch (refinementError) {
        console.error('Failed to get refined pricing, using fallback:', refinementError);
        alert(`Refinement Error: ${refinementError.message}`);
      }

      console.log('Final refined price before creating draft:', refinedPrice);

      // Check if draft already exists and delete it to create fresh one
      if (productDraft) {
        try {
          await authenticatedRequest(`/api/product-drafts/${productDraft.id}`, {
            method: 'DELETE'
          });
          console.log('Deleted existing draft for refresh');
        } catch (deleteError) {
          console.warn('Failed to delete existing draft:', deleteError);
        }
      }

      const draftData = {
        purchaseOrderId: purchaseOrder.id,
        lineItemId: item.id,
        supplierId: purchaseOrder.supplier?.id,
        originalTitle: item.name,
        originalDescription: item.description || '',
        originalPrice: item.unitPrice,
        priceRefined: refinedPrice,
        estimatedMargin: estimatedMargin,
        reviewNotes: appliedRules 
          ? `Auto-created with refinement rules: ${appliedRules}` 
          : 'Auto-created from product detail view'
      };

      console.log('Creating product draft with data:', draftData);

      const response = await authenticatedRequest('/api/product-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftData)
      })

      console.log('Product draft creation response:', response);

      if (response.success) {
        const draft = response.data as ProductDraft;
        setProductDraft(draft);
        // Divide retail price by pack quantity for per-unit display, then apply psychological rounding
        const perUnitRetailPrice = applyPsychologicalRounding((draft.priceRefined || refinedPrice) / packQuantity);
        console.log('Setting editedRetailPrice to:', perUnitRetailPrice, '(per-unit with psychological rounding)');
        setEditedRetailPrice(perUnitRetailPrice);
        console.log('Created product draft with refined price:', draft.priceRefined);
        notificationService.showSuccess('Product draft created with refined pricing', 'Ready for editing');
        
        // Force a UI update
        console.log('Current editedRetailPrice state:', perUnitRetailPrice);
      } else {
        console.error('Failed to create product draft:', response);
        alert(`Draft Creation Failed: ${response.error || 'Unknown error'}`);
        throw new Error(response.error || 'Failed to create product draft');
      }
    } catch (error) {
      console.error('Error creating product draft:', error)
      alert(`Create Draft Error: ${error.message}`);
      notificationService.showError('Failed to create product draft', 'Please try again later')
      throw error;
    }
  }

  const generateAIContent = async () => {
    setGeneratingAI(true)
    try {
      notificationService.showInfo('Generating AI content...', 'This may take a few seconds')

      const response = await authenticatedRequest('/api/ai-generation/product-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productName: item.name,
          originalDescription: item.description,
          sku: item.sku,
          category: editedCategory,
          price: item.unitPrice,
          supplier: purchaseOrder.supplierName,
          lineItemId: item.id
        })
      })

      if (response.success && response.data) {
        const aiData = response.data as {
          refinedTitle: string
          refinedDescription: string
          originalTitle: string
          originalDescription?: string
        }
        
        // Update the edited fields with AI-generated content
        setEditedTitle(aiData.refinedTitle)
        setEditedDescription(aiData.refinedDescription)
        
        // Update product draft if it exists
        if (productDraft) {
          setProductDraft({
            ...productDraft,
            refinedTitle: aiData.refinedTitle,
            refinedDescription: aiData.refinedDescription
          })
        }

        notificationService.showSuccess(
          'AI content generated!',
          'Title and description have been updated'
        )
      } else {
        throw new Error(response.error || 'Failed to generate AI content')
      }
    } catch (error) {
      console.error('Error generating AI content:', error)
      notificationService.showError(
        'Failed to generate AI content',
        error.message || 'Please try again later'
      )
    } finally {
      setGeneratingAI(false)
    }
  }

  const generateAITags = async () => {
    setGeneratingTags(true)
    try {
      notificationService.showInfo('Generating AI tags...', 'This may take a few seconds')

      const response = await authenticatedRequest('/api/ai-generation/product-tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productName: editedTitle || item.name,
          description: editedDescription || item.description,
          sku: item.sku,
          category: editedCategory,
          price: item.unitPrice,
          supplier: purchaseOrder.supplierName,
          lineItemId: item.id
        })
      })

      if (response.success && response.data) {
        const aiData = response.data as {
          productType: string
          vendor: string
          tags: string[]
        }
        
        // Update the edited fields with AI-generated content
        setEditedProductType(aiData.productType)
        setEditedVendor(aiData.vendor)
        setEditedTags(aiData.tags)
        
        // Update product draft if it exists
        if (productDraft) {
          setProductDraft({
            ...productDraft,
            productType: aiData.productType,
            vendor: aiData.vendor,
            tags: aiData.tags
          })
        }

        notificationService.showSuccess(
          'AI tags generated!',
          `Generated ${aiData.tags.length} tags, product type, and vendor`
        )
      } else {
        throw new Error(response.error || 'Failed to generate AI tags')
      }
    } catch (error) {
      console.error('Error generating AI tags:', error)
      notificationService.showError(
        'Failed to generate AI tags',
        error.message || 'Please try again later'
      )
    } finally {
      setGeneratingTags(false)
    }
  }

  const refreshPricing = async () => {
    console.log('=== REFRESH PRICING CLICKED ===');
    console.log('Item details:', { name: item.name, unitPrice: item.unitPrice, id: item.id });
    console.log('Merchant ID:', merchantId);
    
    setLoading(true)
    try {
      // Force create new product draft with current refinement rules
      console.log('About to call createProductDraft...');
      await createProductDraft()
      console.log('createProductDraft completed');
      notificationService.showSuccess('Pricing refreshed', 'Applied latest refinement rules')
    } catch (error) {
      console.error('Error refreshing pricing:', error)
      alert(`Error refreshing pricing: ${error.message}`);
      notificationService.showError('Failed to refresh pricing', 'Please try again')
    } finally {
      setLoading(false)
    }
  }

  // Image Review Functions
  const handleImageSelection = (reviewItemId: string, imageOptionId: string, isSelected: boolean) => {
    setSelectedImages(prev => {
      const current = prev[reviewItemId] || []
      if (isSelected) {
        return {
          ...prev,
          [reviewItemId]: [...current, imageOptionId]
        }
      } else {
        return {
          ...prev,
          [reviewItemId]: current.filter(id => id !== imageOptionId)
        }
      }
    })
  }

  const handleSubmitImageSelections = async () => {
    if (!imageReviewSession?.id) return

    setSaving(true)
    try {
      const selections = Object.entries(selectedImages).map(([reviewItemId, imageIds]) => ({
        reviewItemId,
        selectedImageIds: imageIds,
        imageOrder: imageIds // Use same order for now
      }))

      const response = await authenticatedRequest(
        `/api/image-review/sessions/${imageReviewSession.id}/selections`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selections })
        }
      )

      if (response.success) {
        notificationService.showSuccess('Image selections saved', 'Images approved for Shopify sync')
        await loadImageReviewData() // Refresh the data
        
        // Notify parent component to refresh Quick Sync (only once)
        console.log('📸 Image approval successful, ref current:', imageApprovedCalledRef.current)
        if (onImageApproved && !imageApprovedCalledRef.current) {
          console.log('🚀 Calling onImageApproved callback')
          imageApprovedCalledRef.current = true
          onImageApproved()
        } else {
          console.log('⏭️ Skipping onImageApproved - already called or not available')
        }
      }
    } catch (error) {
      console.error('Error submitting image selections:', error)
      notificationService.showError('Failed to save image selections', 'Please try again later')
    } finally {
      setSaving(false)
    }
  }

  const handleAutoApproveImages = async () => {
    if (!imageReviewSession?.id) return

    setSaving(true)
    try {
      const response = await authenticatedRequest(
        `/api/image-review/sessions/${imageReviewSession.id}/approve-all`,
        { method: 'POST' }
      )

      if (response.success) {
        notificationService.showSuccess('All images auto-approved', 'Using recommended images for Shopify')
        await loadImageReviewData() // Refresh the data
        
        // Notify parent component to refresh Quick Sync (only once)
        console.log('🤖 Auto-approve successful, ref current:', imageApprovedCalledRef.current)
        if (onImageApproved && !imageApprovedCalledRef.current) {
          console.log('🚀 Calling onImageApproved callback (auto-approve)')
          imageApprovedCalledRef.current = true
          onImageApproved()
        } else {
          console.log('⏭️ Skipping onImageApproved - already called or not available')
        }
      }
    } catch (error) {
      console.error('Error auto-approving images:', error)
      notificationService.showError('Failed to auto-approve images', 'Please try again later')
    } finally {
      setSaving(false)
    }
  }

  const handleCustomImageUpload = async (file: File, reviewItemId: string) => {
    setUploadingCustomImage(true)
    try {
      const formData = new FormData()
      formData.append('images', file)
      formData.append('reviewItemId', reviewItemId)

      const response = await authenticatedRequest(
        `/api/image-review/sessions/${imageReviewSession.id}/custom-upload`,
        {
          method: 'POST',
          body: formData
        }
      )

      if (response.success) {
        notificationService.showSuccess('Custom image uploaded', 'Image added to options')
        await loadImageReviewData() // Refresh the data
      }
    } catch (error) {
      console.error('Error uploading custom image:', error)
      notificationService.showError('Failed to upload image', 'Please try again later')
    } finally {
      setUploadingCustomImage(false)
    }
  }

  const handleSave = async () => {
    if (!productDraft) return

    setSaving(true)
    try {
      const response = await authenticatedRequest(`/api/product-drafts/${productDraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refinedTitle: editedTitle,
          refinedDescription: editedDescription,
          priceRefined: editedRetailPrice,
          estimatedMargin: margin,
          tags: editedTags,
          reviewNotes,
          reviewedBy: 'user', // In real app, this would be the current user
          status: 'PENDING_REVIEW',
          // Shopify fields
          productType: editedProductType,
          vendor: editedVendor,
          sku: editedSku,
          compareAtPrice: editedCompareAtPrice,
          costPerItem: editedCostPerItem,
          inventoryQty: editedInventoryQty,
          hsCode: editedHsCode,
          countryOfOrigin: editedCountryOfOrigin
        })
      })

      if (response.success) {
        setProductDraft(response.data as ProductDraft)
        setIsEditing(false)
        notificationService.showSuccess('Product draft saved successfully', 'Changes have been applied')
        
        // Update the parent component
        onSave({
          ...item,
          name: editedTitle,
          description: editedDescription,
          unitPrice: editedPrice,
          weight: editedWeight,
          barcode: editedBarcode
        })
      }
    } catch (error) {
      console.error('Error saving product draft:', error)
      notificationService.showError('Failed to save product draft', 'Please try again later')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async () => {
    if (!productDraft) return

    setSaving(true)
    try {
      const response = await authenticatedRequest(`/api/product-drafts/${productDraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          reviewedBy: 'user',
          reviewNotes: reviewNotes || 'Approved for Shopify sync'
        })
      })

      if (response.success) {
        setProductDraft(response.data as ProductDraft)
        notificationService.showSuccess('Product approved for Shopify sync', 'Ready for deployment')
      }
    } catch (error) {
      console.error('Error approving product:', error)
      notificationService.showError('Failed to approve product', 'Please try again later')
    } finally {
      setSaving(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-slate-100 text-slate-700 border-slate-300'
      case 'PENDING_REVIEW': return 'bg-yellow-100 text-yellow-700 border-yellow-300'
      case 'APPROVED': return 'bg-green-100 text-green-700 border-green-300'
      case 'REJECTED': return 'bg-red-100 text-red-700 border-red-300'
      case 'SYNCING': return 'bg-blue-100 text-blue-700 border-blue-300'
      case 'SYNCED': return 'bg-emerald-100 text-emerald-700 border-emerald-300'
      case 'FAILED': return 'bg-red-100 text-red-700 border-red-300'
      default: return 'bg-slate-100 text-slate-700 border-slate-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DRAFT': return <Edit className="w-4 h-4" />
      case 'PENDING_REVIEW': return <Clock className="w-4 h-4" />
      case 'APPROVED': return <CheckCircle className="w-4 h-4" />
      case 'REJECTED': return <XCircle className="w-4 h-4" />
      case 'SYNCING': return <Robot className="w-4 h-4" />
      case 'SYNCED': return <Check className="w-4 h-4" />
      case 'FAILED': return <AlertTriangle className="w-4 h-4" />
      default: return <Package className="w-4 h-4" />
    }
  }

  if (loading) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <Robot className="w-8 h-8 mx-auto mb-4 animate-spin" />
              <p className="text-sm text-muted-foreground">Loading product details...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden border border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur">
        <div className="relative overflow-hidden border-b border-border/50 bg-gradient-to-br from-slate-950 via-slate-900 to-black text-slate-100">
          <div className="pointer-events-none absolute -top-24 right-0 h-64 w-64 rounded-full bg-sky-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-16 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm">
                  <Package className="h-6 w-6 text-sky-200" weight="duotone" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                    Product Detail & Shopify Preparation
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-300">
                    Fine-tune AI-assisted product data before publishing to Shopify.
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {productDraft && (
                  <Badge className="flex items-center gap-1 border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-white backdrop-blur">
                    {getStatusIcon(productDraft.status)}
                    <span>{productDraft.status.replace('_', ' ')}</span>
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-200 hover:bg-white/10 hover:text-white"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-slate-200">
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur">
                <ShoppingCart className="h-3.5 w-3.5 text-sky-200" />
                <span>PO {purchaseOrder.number}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur">
                <Tag className="h-3.5 w-3.5 text-sky-200" />
                <span>{purchaseOrder.supplierName || 'Unknown supplier'}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur">
                <Barcode className="h-3.5 w-3.5 text-sky-200" />
                <span>{item.sku || 'No SKU'}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur">
                <ChartBar className="h-3.5 w-3.5 text-sky-200" />
                <span>{item.quantity} units</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur">
                <Robot className="h-3.5 w-3.5 text-sky-200" />
                <span>{item.confidence != null ? `${item.confidence}% AI confidence` : 'Confidence pending'}</span>
              </div>
            </div>
          </div>
        </div>

        <ScrollArea className="max-h-[78vh]">
          <div className="space-y-6 px-6 pb-8 pt-6">
            {/* Product Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Product Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">SKU</Label>
                    <p className="font-mono text-sm">{item.sku}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Quantity</Label>
                    <p className="text-sm">{item.quantity} units</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Supplier</Label>
                    <p className="text-sm">{purchaseOrder.supplierName}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">PO Number</Label>
                    <p className="text-sm font-mono">{purchaseOrder.number}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">AI Confidence</Label>
                    <Badge variant="outline" className="w-fit">
                      {item.confidence}%
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Total Value</Label>
                    <p className="text-sm font-medium">
                      {purchaseOrder.currency} {item.totalPrice.toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-5 gap-2 rounded-2xl border border-border/60 bg-muted/40 p-1 backdrop-blur">
                <TabsTrigger
                  value="details"
                  className="group flex items-center justify-center gap-2 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground data-[state=active]:border-border/70 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-lg"
                >
                  <ClipboardText className="h-4 w-4 transition-transform duration-200 group-data-[state=active]:scale-110" />
                  <span>Product Details</span>
                </TabsTrigger>
                <TabsTrigger
                  value="pricing"
                  className="group flex items-center justify-center gap-2 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground data-[state=active]:border-border/70 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-lg"
                >
                  <DollarSign className="h-4 w-4 transition-transform duration-200 group-data-[state=active]:scale-110" />
                  <span>Pricing & Margins</span>
                </TabsTrigger>
                <TabsTrigger
                  value="images"
                  className="group flex items-center justify-center gap-2 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground data-[state=active]:border-border/70 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-lg"
                >
                  <ImageIcon className="h-4 w-4 transition-transform duration-200 group-data-[state=active]:scale-110" />
                  <span>Images & Photos</span>
                </TabsTrigger>
                <TabsTrigger
                  value="attributes"
                  className="group flex items-center justify-center gap-2 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground data-[state=active]:border-border/70 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-lg"
                >
                  <SquaresFour className="h-4 w-4 transition-transform duration-200 group-data-[state=active]:scale-110" />
                  <span>Attributes & Tags</span>
                </TabsTrigger>
                <TabsTrigger
                  value="shopify"
                  className="group flex items-center justify-center gap-2 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground data-[state=active]:border-border/70 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-lg"
                >
                  <RocketLaunch className="h-4 w-4 transition-transform duration-200 group-data-[state=active]:scale-110" />
                  <span>Shopify Preparation</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      Product Information
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={generateAIContent}
                          disabled={generatingAI || saving}
                          className="flex items-center gap-2"
                        >
                          <Robot className="w-4 h-4" />
                          {generatingAI ? 'Generating...' : 'Generate AI Content'}
                        </Button>
                        {!isEditing ? (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setIsEditing(true)}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </Button>
                        ) : (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => setIsEditing(false)}
                            >
                              <X className="w-4 h-4 mr-2" />
                              Cancel
                            </Button>
                            <Button 
                              size="sm" 
                              onClick={handleSave}
                              disabled={saving}
                            >
                              <Save className="w-4 h-4 mr-2" />
                              {saving ? 'Saving...' : 'Save'}
                            </Button>
                          </>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Product Title</Label>
                      {isEditing ? (
                        <Input
                          id="title"
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          placeholder="Enter product title..."
                        />
                      ) : (
                        <p className="text-sm p-3 bg-muted/30 rounded-md">{editedTitle}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Product Description</Label>
                      {isEditing ? (
                        <Textarea
                          id="description"
                          value={editedDescription}
                          onChange={(e) => setEditedDescription(e.target.value)}
                          placeholder="Enter product description..."
                          rows={4}
                        />
                      ) : (
                        <p className="text-sm p-3 bg-muted/30 rounded-md min-h-[100px]">
                          {editedDescription || 'No description provided'}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="weight">Weight (lbs)</Label>
                        {isEditing ? (
                          <Input
                            id="weight"
                            type="number"
                            step="0.01"
                            value={editedWeight}
                            onChange={(e) => setEditedWeight(parseFloat(e.target.value) || 0)}
                          />
                        ) : (
                          <p className="text-sm p-3 bg-muted/30 rounded-md">
                            {editedWeight || 'Not specified'} lbs
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="barcode">Barcode/UPC</Label>
                        {isEditing ? (
                          <Input
                            id="barcode"
                            value={editedBarcode}
                            onChange={(e) => setEditedBarcode(e.target.value)}
                            placeholder="Enter barcode..."
                          />
                        ) : (
                          <p className="text-sm p-3 bg-muted/30 rounded-md font-mono">
                            {editedBarcode || 'Not specified'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-base font-semibold">Shopify Product Fields</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div className="space-y-2">
                          <Label htmlFor="product-type">Product Type</Label>
                          {isEditing ? (
                            <Input
                              id="product-type"
                              value={editedProductType}
                              onChange={(e) => setEditedProductType(e.target.value)}
                              placeholder="e.g., Electronics, Clothing"
                            />
                          ) : (
                            <p className="text-sm p-3 bg-muted/30 rounded-md">
                              {editedProductType || 'Not specified'}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="vendor">Vendor/Brand</Label>
                          {isEditing ? (
                            <Input
                              id="vendor"
                              value={editedVendor}
                              onChange={(e) => setEditedVendor(e.target.value)}
                              placeholder="Brand or manufacturer name"
                            />
                          ) : (
                            <p className="text-sm p-3 bg-muted/30 rounded-md">
                              {editedVendor || 'Not specified'}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="sku">SKU</Label>
                          {isEditing ? (
                            <Input
                              id="sku"
                              value={editedSku}
                              onChange={(e) => setEditedSku(e.target.value)}
                              placeholder="Stock keeping unit"
                            />
                          ) : (
                            <p className="text-sm p-3 bg-muted/30 rounded-md font-mono">
                              {editedSku || 'Not specified'}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="inventory-qty">Inventory Quantity</Label>
                          {isEditing ? (
                            <Input
                              id="inventory-qty"
                              type="number"
                              value={editedInventoryQty}
                              onChange={(e) => setEditedInventoryQty(parseInt(e.target.value) || 0)}
                              placeholder="Initial stock quantity"
                            />
                          ) : (
                            <p className="text-sm p-3 bg-muted/30 rounded-md">
                              {editedInventoryQty || 0} units
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="hs-code">HS Code</Label>
                          {isEditing ? (
                            <Input
                              id="hs-code"
                              value={editedHsCode}
                              onChange={(e) => setEditedHsCode(e.target.value)}
                              placeholder="Harmonized System code"
                            />
                          ) : (
                            <p className="text-sm p-3 bg-muted/30 rounded-md font-mono">
                              {editedHsCode || 'Not specified'}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="country-origin">Country of Origin</Label>
                          {isEditing ? (
                            <Input
                              id="country-origin"
                              value={editedCountryOfOrigin}
                              onChange={(e) => setEditedCountryOfOrigin(e.target.value)}
                              placeholder="Manufacturing country"
                            />
                          ) : (
                            <p className="text-sm p-3 bg-muted/30 rounded-md">
                              {editedCountryOfOrigin || 'Not specified'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="pricing" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        Pricing Strategy
                      </CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={refreshPricing}
                        disabled={loading}
                        className="flex items-center gap-2"
                      >
                        <MagicWand className="w-4 h-4" />
                        {loading ? 'Refreshing...' : 'Refresh Pricing'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="cost-price">Cost Price (Wholesale)</Label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="cost-price"
                              type="number"
                              step="0.01"
                              value={editedPrice}
                              onChange={(e) => setEditedPrice(parseFloat(e.target.value) || 0)}
                              className="pl-10"
                              readOnly={!isEditing}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="retail-price">Retail Price (Shopify)</Label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="retail-price"
                              type="number"
                              step="0.01"
                              value={editedRetailPrice}
                              onChange={(e) => setEditedRetailPrice(parseFloat(e.target.value) || 0)}
                              className="pl-10"
                              readOnly={!isEditing}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="compare-price">Compare At Price (MSRP)</Label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="compare-price"
                              type="number"
                              step="0.01"
                              value={editedCompareAtPrice || ''}
                              onChange={(e) => setEditedCompareAtPrice(e.target.value ? parseFloat(e.target.value) : undefined)}
                              className="pl-10"
                              placeholder="Optional - shows savings"
                              readOnly={!isEditing}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Shows strikethrough price on product page to display savings
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="cost-per-item">Cost Per Item (Shopify)</Label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="cost-per-item"
                              type="number"
                              step="0.01"
                              value={editedCostPerItem}
                              onChange={(e) => setEditedCostPerItem(parseFloat(e.target.value) || 0)}
                              className="pl-10"
                              readOnly={!isEditing}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Used by Shopify for profit reporting
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Card className="bg-muted/30">
                          <CardContent className="pt-6">
                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Profit Margin</span>
                                <span className="text-lg font-semibold text-green-600">
                                  {margin.toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Markup</span>
                                <span className="text-lg font-semibold text-blue-600">
                                  {markup.toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Profit per Unit</span>
                                <span className="text-lg font-semibold text-purple-600">
                                  ${(editedRetailPrice - editedPrice).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {margin < 20 && (
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              Low margin warning: Consider increasing retail price for better profitability.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="images" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <ImageIcon className="w-5 h-5" />
                        Product Images & Photos
                      </CardTitle>
                      {item.images?.needsReview && (
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                          Needs Review
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {loadingImages ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                          <p className="text-sm text-muted-foreground">Loading images...</p>
                        </div>
                      </div>
                    ) : imageOptions.length === 0 ? (
                      <Alert>
                        <ImageIcon className="h-4 w-4" />
                        <AlertDescription>
                          No image review session found for this product. Images may still be processing in the pipeline.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <>
                        {/* Image Review Dashboard */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium">Select Images for Shopify</h4>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleAutoApproveImages}
                                disabled={saving}
                                className="flex items-center gap-2"
                              >
                                <MagicWand className="w-4 h-4" />
                                Auto-Approve Recommended
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSubmitImageSelections}
                                disabled={saving || Object.keys(selectedImages).length === 0}
                                className="flex items-center gap-2"
                              >
                                <Check className="w-4 h-4" />
                                {saving ? 'Saving...' : 'Approve Selected'}
                              </Button>
                            </div>
                          </div>

                          {/* Image Options for this Product */}
                          {imageOptions.map((dashboardItem: any) => (
                            <Card key={dashboardItem.reviewItemId} className="border-l-4 border-l-blue-500">
                              <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                  <CardTitle className="text-base">{dashboardItem.productName}</CardTitle>
                                  <Badge variant="outline">
                                    {dashboardItem.imageOptions.length} options
                                  </Badge>
                                </div>
                                {dashboardItem.sku && (
                                  <p className="text-sm text-muted-foreground font-mono">{dashboardItem.sku}</p>
                                )}
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {/* Image Options Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {dashboardItem.imageOptions.map((imageOption: any) => {
                                    const isSelected = selectedImages[dashboardItem.reviewItemId]?.includes(imageOption.id)
                                    
                                    return (
                                      <div
                                        key={imageOption.id}
                                        className={`relative border-2 rounded-lg p-2 cursor-pointer transition-all ${
                                          isSelected 
                                            ? 'border-blue-500 bg-blue-50' 
                                            : 'border-gray-200 hover:border-gray-300'
                                        } ${imageOption.type === 'MAIN' ? 'ring-2 ring-green-200' : ''}`}
                                        onClick={() => handleImageSelection(
                                          dashboardItem.reviewItemId, 
                                          imageOption.id, 
                                          !isSelected
                                        )}
                                      >
                                        {/* Image Preview */}
                                        <div className="aspect-square bg-gray-100 rounded-md mb-2 overflow-hidden flex items-center justify-center">
                                          <img
                                            src={imageOption.url}
                                            alt={imageOption.altText || 'Product image'}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                              console.warn('Image failed to load:', imageOption.url)
                                              // Use a simple gray placeholder SVG as data URL
                                              const target = e.target as HTMLImageElement
                                              target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23e5e7eb"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%239ca3af"%3EImage Unavailable%3C/text%3E%3C/svg%3E'
                                              target.onerror = null // Prevent infinite loop
                                            }}
                                          />
                                        </div>
                                        
                                        {/* Image Info */}
                                        <div className="space-y-1">
                                          <div className="flex items-center justify-between">
                                            <Badge 
                                              variant={imageOption.type === 'MAIN' ? 'default' : 'outline'}
                                              className="text-xs"
                                            >
                                              {imageOption.type || 'GALLERY'}
                                            </Badge>
                                            {imageOption.type === 'MAIN' && (
                                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                                                Recommended
                                              </Badge>
                                            )}
                                          </div>
                                          
                                          <p className="text-xs text-muted-foreground">
                                            Source: {imageOption.source || 'Unknown'}
                                          </p>
                                          
                                          {imageOption.isApproved && (
                                            <p className="text-xs text-green-600">
                                              ✓ Approved
                                            </p>
                                          )}
                                        </div>
                                        
                                        {/* Selection Indicator */}
                                        {isSelected && (
                                          <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                                            <Check className="w-4 h-4" />
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>

                                {/* Custom Upload Option */}
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                                  <div className="text-center">
                                    <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                    <p className="text-sm text-muted-foreground mb-2">
                                      Don't see the right image? Upload your own
                                    </p>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                          handleCustomImageUpload(file, dashboardItem.reviewItemId)
                                        }
                                      }}
                                      className="hidden"
                                      id={`custom-upload-${dashboardItem.reviewItemId}`}
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        document.getElementById(`custom-upload-${dashboardItem.reviewItemId}`)?.click()
                                      }}
                                      disabled={uploadingCustomImage}
                                    >
                                      {uploadingCustomImage ? 'Uploading...' : 'Upload Custom Image'}
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>

                        {/* Session Status */}
                        {imageReviewSession && (
                          <Card className="bg-muted/30">
                            <CardContent className="pt-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Session Status:</span>
                                  <p className="font-medium">{imageReviewSession.status}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Created:</span>
                                  <p>{new Date(imageReviewSession.createdAt).toLocaleDateString()}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Expires:</span>
                                  <p>{new Date(imageReviewSession.expiresAt).toLocaleDateString()}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Total Images:</span>
                                  <p>{item.images?.totalImages || 0}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="attributes" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag className="w-5 h-5" />
                        Product Attributes
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={generateAITags}
                        disabled={generatingTags || saving}
                        className="flex items-center gap-2"
                      >
                        <Robot className="w-4 h-4" />
                        {generatingTags ? 'Generating...' : 'Generate AI Tags'}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="category">Product Category</Label>
                      {isEditing ? (
                        <Select value={editedCategory} onValueChange={setEditedCategory}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="electronics">Electronics</SelectItem>
                            <SelectItem value="clothing">Clothing & Apparel</SelectItem>
                            <SelectItem value="home">Home & Garden</SelectItem>
                            <SelectItem value="sports">Sports & Outdoors</SelectItem>
                            <SelectItem value="books">Books & Media</SelectItem>
                            <SelectItem value="toys">Toys & Games</SelectItem>
                            <SelectItem value="health">Health & Beauty</SelectItem>
                            <SelectItem value="automotive">Automotive</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm p-3 bg-muted/30 rounded-md">
                          {editedCategory || 'Not categorized'}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Product Tags</Label>
                      {isEditing ? (
                        <div className="space-y-2">
                          <Input
                            placeholder="Add tags (press Enter to add)"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const value = (e.target as HTMLInputElement).value.trim()
                                if (value && !editedTags.includes(value)) {
                                  setEditedTags([...editedTags, value]);
                                  (e.target as HTMLInputElement).value = ''
                                }
                              }
                            }}
                          />
                          <div className="flex flex-wrap gap-2">
                            {editedTags.map((tag, index) => (
                              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                                {tag}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => setEditedTags(editedTags.filter((_, i) => i !== index))}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {editedTags.length > 0 ? (
                            editedTags.map((tag, index) => (
                              <Badge key={index} variant="outline">{tag}</Badge>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">No tags added</p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="shopify" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MagicWand className="w-5 h-5" />
                      Shopify Deployment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {productDraft?.shopifyProductId ? (
                      <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>
                          This product has been synced to Shopify. Product ID: {productDraft.shopifyProductId}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          This product is ready for Shopify deployment once approved.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="review-notes">Review Notes</Label>
                      <Textarea
                        id="review-notes"
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Add notes about this product preparation..."
                        rows={3}
                      />
                    </div>

                    <div className="flex gap-2">
                      {productDraft?.status === 'DRAFT' || productDraft?.status === 'PENDING_REVIEW' ? (
                        <Button onClick={handleApprove} disabled={saving} className="bg-green-600 hover:bg-green-700">
                          <Check className="w-4 h-4 mr-2" />
                          {saving ? 'Approving...' : 'Approve for Shopify'}
                        </Button>
                      ) : null}
                      
                      <Button variant="outline" onClick={handleSave} disabled={saving}>
                        <Save className="w-4 h-4 mr-2" />
                        {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>

                    {productDraft && (
                      <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                        <h4 className="text-sm font-medium mb-2">Draft Information</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Created:</span>
                            <p>{new Date(productDraft.createdAt).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Last Updated:</span>
                            <p>{new Date(productDraft.updatedAt).toLocaleDateString()}</p>
                          </div>
                          {productDraft.reviewedBy && (
                            <>
                              <div>
                                <span className="text-muted-foreground">Reviewed By:</span>
                                <p>{productDraft.reviewedBy}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Reviewed At:</span>
                                <p>{productDraft.reviewedAt ? new Date(productDraft.reviewedAt).toLocaleDateString() : 'N/A'}</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}