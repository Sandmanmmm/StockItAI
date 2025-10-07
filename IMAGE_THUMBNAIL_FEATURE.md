# Product Image Thumbnails in Line Items

## Feature Overview
Added a toggle to display thumbnail previews of approved product photos directly in the line items table.

## Implementation Details

### Location
- **Component**: `MerchantReviewInterface.tsx`
- **Tab**: Line Items tab in the Purchase Order review interface

### Features
1. **Toggle Switch**: Located in the Line Items card header
   - Label: "Show Product Images"
   - Default: OFF (thumbnails hidden)
   - Persists during the session

2. **Thumbnail Display**:
   - Size: 48x48px (12 tailwind units)
   - Rounded corners with border
   - Fallback: Package icon if no image available
   - Error handling: Shows package icon if image fails to load

3. **Image Selection Logic**:
   - Fetches images from the IMAGE_ATTACHMENT workflow stage
   - Prioritizes approved/selected images first
   - Falls back to first available image if none approved
   - Automatically loads when toggle is enabled

### User Experience
1. Merchant reviews a purchase order with line items
2. Toggles "Show Product Images" switch ON
3. System fetches approved images from image review session
4. Thumbnails appear in a new leftmost column
5. Each thumbnail shows the product's approved image
6. Clicking a line item still opens the full product detail view

### Technical Implementation

**State Management**:
```typescript
const [showImageThumbnails, setShowImageThumbnails] = useState(false)
const [lineItemImages, setLineItemImages] = useState<Record<string, string | null>>({})
```

**Image Fetching**:
```typescript
useEffect(() => {
  const fetchLineItemImages = async () => {
    // Fetch image review session by PO ID
    // Map line item IDs to approved images
    // Store in lineItemImages state
  }
  fetchLineItemImages()
}, [showImageThumbnails, purchaseOrder?.id])
```

**Table Structure**:
- New "Image" column (width: 80px) when toggle is ON
- Responsive image with object-cover
- Graceful fallback for missing/failed images

### Benefits
✅ **Quick Visual Verification**: Merchants can verify products at a glance  
✅ **Non-Intrusive**: Optional toggle keeps UI clean when not needed  
✅ **Integrated**: Works seamlessly with existing image review workflow  
✅ **Performance**: Images only fetched when toggle is enabled  
✅ **Error Resilient**: Handles missing images gracefully  

### API Integration
- **Endpoint 1**: `/api/image-review/sessions/by-purchase-order/:poId`
  - Gets session ID for the PO
- **Endpoint 2**: `/api/image-review/sessions/:sessionId`
  - Gets full session with products and approved images
- **Data Mapping**: Links `lineItemId` to approved `imageUrl`

### Future Enhancements
- [ ] Click thumbnail to open full-size preview
- [ ] Show multiple images indicator (e.g., "3 images")
- [ ] Add image status badge (approved/pending)
- [ ] Lazy loading for large line item lists
- [ ] Thumbnail cache for faster subsequent loads

## Testing
1. Upload a PO with products
2. Wait for IMAGE_ATTACHMENT stage to complete
3. Review product images in ProductDetailView
4. Approve images for products
5. Navigate to Purchase Order review page
6. Go to Line Items tab
7. Toggle "Show Product Images" switch
8. Verify thumbnails appear with approved images

## Related Files
- `src/components/admin/MerchantReviewInterface.tsx` - Main component
- `api/src/routes/imageReview.js` - Image review API endpoints
- `api/src/lib/workflowOrchestrator.js` - IMAGE_ATTACHMENT stage
- `src/components/ProductDetailView.tsx` - Image selection interface

## Database Schema
- **ImageReviewSession**: Links PO to image review workflow
- **ImageReviewProduct**: Contains lineItemId for mapping
- **ImageReviewProductImage**: Stores imageUrl and approval status
