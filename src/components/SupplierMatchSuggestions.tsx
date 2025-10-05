import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  MagicWand,
  CheckCircle,
  Warning as AlertTriangle,
  Building,
  EnvelopeSimple as Mail,
  Phone,
  MapPin,
  Globe,
  ArrowsClockwise as Refresh,
  Link as LinkIcon,
  Plus,
  TrendUp,
  Package
} from '@phosphor-icons/react'
import { authenticatedRequest } from '@/lib/shopifyApiService'
import { notificationService } from '@/lib/notificationService'
import CreateSupplierDialog from './CreateSupplierDialog'

interface SupplierMatch {
  supplier: {
    id: string
    name: string
    contactEmail: string | null
    contactPhone: string | null
    address: string | null
    website: string | null
    status: string
    totalPOs: number
    createdAt: string
  }
  matchScore: number
  confidence: 'high' | 'medium' | 'low'
  breakdown: {
    name: number
    email: number
    phone: number
    address: number
    website: number
  }
  availableFields: string[]
}

interface SupplierMatchSuggestionsProps {
  purchaseOrderId: string
  currentSupplierId?: string | null
  onSupplierLinked?: (supplierId: string) => void
  currency?: string
}

export function SupplierMatchSuggestions({
  purchaseOrderId,
  currentSupplierId,
  onSupplierLinked,
  currency = 'USD'
}: SupplierMatchSuggestionsProps) {
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const fetchSuggestions = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await authenticatedRequest<any>(
        `/api/suppliers/suggest/${purchaseOrderId}`,
        {
          method: 'POST'
        }
      )

      if (result.success && result.data) {
        setSuggestions(result.data)
      } else {
        setError(result.error || 'Failed to get supplier suggestions')
      }
    } catch (err) {
      console.error('Error fetching supplier suggestions:', err)
      setError('Failed to load supplier suggestions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSuggestions()
  }, [purchaseOrderId])

  const handleLinkSupplier = async (supplierId: string) => {
    setLinking(supplierId)

    try {
      const result = await authenticatedRequest<any>(
        `/api/suppliers/link/${purchaseOrderId}/${supplierId}`,
        {
          method: 'PUT'
        }
      )

      if (result.success) {
        notificationService.showSuccess(
          'Supplier Linked',
          `Successfully linked to ${result.data.supplier.name}`,
          { category: 'user', priority: 'medium' }
        )

        // Refresh suggestions
        await fetchSuggestions()

        // Notify parent
        if (onSupplierLinked) {
          onSupplierLinked(supplierId)
        }
      } else {
        throw new Error(result.error || 'Failed to link supplier')
      }
    } catch (err) {
      console.error('Error linking supplier:', err)
      notificationService.showError(
        'Link Failed',
        'Failed to link supplier. Please try again.',
        { category: 'system', priority: 'high' }
      )
    } finally {
      setLinking(null)
    }
  }

  const handleAutoMatch = async () => {
    setLinking('auto')

    try {
      const result = await authenticatedRequest<any>(
        `/api/suppliers/auto-match/${purchaseOrderId}`,
        {
          method: 'POST',
          body: JSON.stringify({
            options: {
              autoLink: true,
              minAutoLinkScore: 0.85,
              createIfNoMatch: false
            }
          })
        }
      )

      if (result.success) {
        const { action, linkedSupplier, suggestionsCount } = result.data

        if (action === 'auto_linked' && linkedSupplier) {
          notificationService.showSuccess(
            'Auto-Match Successful',
            `Automatically linked to ${linkedSupplier.name}`,
            { category: 'user', priority: 'medium' }
          )

          await fetchSuggestions()

          if (onSupplierLinked) {
            onSupplierLinked(linkedSupplier.id)
          }
        } else if (action === 'suggestions_available') {
          notificationService.showInfo(
            'Manual Selection Needed',
            `Found ${suggestionsCount} potential matches. Please review and select.`,
            { category: 'user', priority: 'low' }
          )
        } else {
          notificationService.showInfo(
            'No Matches Found',
            'No matching suppliers found. Consider creating a new one.',
            { category: 'user', priority: 'low' }
          )
        }
      } else {
        throw new Error(result.error || 'Auto-match failed')
      }
    } catch (err) {
      console.error('Error in auto-match:', err)
      notificationService.showError(
        'Auto-Match Failed',
        'Failed to auto-match supplier. Please try again.',
        { category: 'system', priority: 'high' }
      )
    } finally {
      setLinking(null)
    }
  }

  const handleSupplierCreated = async (newSupplier: any) => {
    console.log('New supplier created:', newSupplier)
    
    // Close the dialog
    setShowCreateDialog(false)

    // Link the new supplier to the purchase order
    try {
      const result = await authenticatedRequest<any>(
        `/api/suppliers/link/${purchaseOrderId}/${newSupplier.id}`,
        {
          method: 'PUT'
        }
      )

      if (result.success) {
        notificationService.showSuccess(
          'Supplier Created & Linked',
          `${newSupplier.name} has been created and linked to this purchase order.`,
          { category: 'user', priority: 'medium' }
        )

        // Refresh suggestions
        await fetchSuggestions()

        // Notify parent
        if (onSupplierLinked) {
          onSupplierLinked(newSupplier.id)
        }
      } else {
        throw new Error(result.error || 'Failed to link supplier')
      }
    } catch (err) {
      console.error('Error linking new supplier:', err)
      notificationService.showError(
        'Link Failed',
        'Supplier was created but failed to link to purchase order.',
        { category: 'system', priority: 'high' }
      )
    }
  }

  const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
    const variants = {
      high: 'bg-green-100 text-green-800 border-green-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-gray-100 text-gray-800 border-gray-200'
    }

    return (
      <Badge variant="outline" className={variants[confidence]}>
        {confidence.toUpperCase()} Confidence
      </Badge>
    )
  }

  const getScoreBadge = (score: number) => {
    let color = 'bg-gray-100 text-gray-800'
    if (score >= 0.85) color = 'bg-green-100 text-green-800'
    else if (score >= 0.7) color = 'bg-yellow-100 text-yellow-800'
    else color = 'bg-orange-100 text-orange-800'

    return (
      <Badge className={`${color} font-mono`}>
        {Math.round(score * 100)}% Match
      </Badge>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MagicWand className="h-5 w-5 animate-pulse" />
            Finding Matching Suppliers...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!suggestions) {
    return null
  }

  const {
    parsedSupplier,
    suggestions: matchSuggestions,
    recommendAction,
    currentSupplierId: linkedSupplierId
  } = suggestions

  const hasHighConfidence = matchSuggestions.highConfidence?.length > 0
  const hasMediumConfidence = matchSuggestions.mediumConfidence?.length > 0
  const hasLowConfidence = matchSuggestions.lowConfidence?.length > 0
  const totalMatches = matchSuggestions.total || 0

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MagicWand className="h-5 w-5 text-purple-500" />
                Supplier Matching
              </CardTitle>
              <CardDescription className="mt-2">
                AI-powered fuzzy matching found {totalMatches} potential supplier{totalMatches !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSuggestions}
              disabled={loading}
            >
              <Refresh className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Parsed Supplier Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-semibold mb-2 text-gray-700">Detected Supplier Information:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {parsedSupplier.name && (
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-gray-400" />
                  <span className="font-medium">{parsedSupplier.name}</span>
                </div>
              )}
              {parsedSupplier.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">{parsedSupplier.email}</span>
                </div>
              )}
              {parsedSupplier.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">{parsedSupplier.phone}</span>
                </div>
              )}
              {parsedSupplier.website && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">{parsedSupplier.website}</span>
                </div>
              )}
            </div>
          </div>

          {/* Current Status */}
          {linkedSupplierId && (
            <Alert className="mb-4 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Supplier already linked to this purchase order.
              </AlertDescription>
            </Alert>
          )}

          {/* Auto-Match Button */}
          {!linkedSupplierId && totalMatches > 0 && (
            <Button
              onClick={handleAutoMatch}
              disabled={linking === 'auto'}
              className="w-full mb-4 bg-purple-600 hover:bg-purple-700"
            >
              {linking === 'auto' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Auto-Matching...
                </>
              ) : (
                <>
                  <MagicWand className="h-4 w-4 mr-2" />
                  Auto-Match Best Supplier
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* High Confidence Matches */}
      {hasHighConfidence && (
        <Card className="border-green-200">
          <CardHeader className="bg-green-50">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              High Confidence Matches ({matchSuggestions.highConfidence.length})
            </CardTitle>
            <CardDescription>These suppliers are very likely to be the correct match</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ScrollArea className="h-auto max-h-[400px]">
              <div className="space-y-3">
                {matchSuggestions.highConfidence.map((match: SupplierMatch) => (
                  <SupplierMatchCard
                    key={match.supplier.id}
                    match={match}
                    onLink={handleLinkSupplier}
                    isLinking={linking === match.supplier.id}
                    isLinked={linkedSupplierId === match.supplier.id}
                  />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Medium Confidence Matches */}
      {hasMediumConfidence && (
        <Card className="border-yellow-200">
          <CardHeader className="bg-yellow-50">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Medium Confidence Matches ({matchSuggestions.mediumConfidence.length})
            </CardTitle>
            <CardDescription>These suppliers might be the correct match</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ScrollArea className="h-auto max-h-[300px]">
              <div className="space-y-3">
                {matchSuggestions.mediumConfidence.map((match: SupplierMatch) => (
                  <SupplierMatchCard
                    key={match.supplier.id}
                    match={match}
                    onLink={handleLinkSupplier}
                    isLinking={linking === match.supplier.id}
                    isLinked={linkedSupplierId === match.supplier.id}
                  />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* No Matches */}
      {totalMatches === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Building className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No Matching Suppliers Found</h3>
              <p className="text-gray-500 mb-4">
                No existing suppliers match this purchase order's supplier information.
              </p>
              <CreateSupplierDialog 
                onSuccess={handleSupplierCreated}
                initialData={{
                  name: parsedSupplier?.name || '',
                  contactEmail: parsedSupplier?.email || '',
                  contactPhone: parsedSupplier?.phone || '',
                  website: parsedSupplier?.website || '',
                  address: parsedSupplier?.address || '',
                  currency: parsedSupplier?.currency || currency
                }}
              >
                <Button variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create New Supplier
                </Button>
              </CreateSupplierDialog>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Supplier Match Card Component
function SupplierMatchCard({
  match,
  onLink,
  isLinking,
  isLinked
}: {
  match: SupplierMatch
  onLink: (supplierId: string) => void
  isLinking: boolean
  isLinked: boolean
}) {
  const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
    const variants = {
      high: 'bg-green-100 text-green-800 border-green-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-gray-100 text-gray-800 border-gray-200'
    }

    return (
      <Badge variant="outline" className={variants[confidence]}>
        {confidence.toUpperCase()}
      </Badge>
    )
  }

  const getScoreBadge = (score: number) => {
    let color = 'bg-gray-100 text-gray-800'
    if (score >= 0.85) color = 'bg-green-100 text-green-800'
    else if (score >= 0.7) color = 'bg-yellow-100 text-yellow-800'
    else color = 'bg-orange-100 text-orange-800'

    return (
      <Badge className={`${color} font-mono`}>
        {Math.round(score * 100)}% Match
      </Badge>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-lg flex items-center gap-2">
            {match.supplier.name}
            {isLinked && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                <CheckCircle className="h-3 w-3 mr-1" />
                Linked
              </Badge>
            )}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            {getScoreBadge(match.matchScore)}
            {getConfidenceBadge(match.confidence)}
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => onLink(match.supplier.id)}
          disabled={isLinking || isLinked}
          variant={isLinked ? 'outline' : 'default'}
        >
          {isLinking ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          ) : isLinked ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Linked
            </>
          ) : (
            <>
              <LinkIcon className="h-4 w-4 mr-2" />
              Link
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 mb-3">
        {match.supplier.contactEmail && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-400" />
            {match.supplier.contactEmail}
          </div>
        )}
        {match.supplier.contactPhone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-gray-400" />
            {match.supplier.contactPhone}
          </div>
        )}
        {match.supplier.website && (
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-gray-400" />
            {match.supplier.website}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-gray-400" />
          {match.supplier.totalPOs} purchase orders
        </div>
      </div>

      {/* Match Breakdown */}
      <div className="border-t pt-3">
        <p className="text-xs text-gray-500 mb-2">Match Details:</p>
        <div className="flex flex-wrap gap-2">
          {match.availableFields.map(field => {
            const score = match.breakdown[field as keyof typeof match.breakdown]
            if (score > 0) {
              return (
                <Badge key={field} variant="secondary" className="text-xs">
                  {field}: {Math.round(score * 100)}%
                </Badge>
              )
            }
            return null
          })}
        </div>
      </div>
    </motion.div>
  )
}
