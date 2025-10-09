/**
 * Create Supplier Dialog Component
 * 
 * Professional, multi-step form for creating new suppliers with:
 * - Step-by-step wizard UI
 * - Form validation
 * - Visual feedback
 * - Quick setup option
 */

import { useState, useEffect } from 'react'
import { authenticatedRequest } from '@/lib/shopifyApiService'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Building,
  Envelope,
  Phone,
  Globe,
  CreditCard,
  Tag,
  Lightning,
  Clock,
  MapPin,
  User,
  X,
  Warning
} from '@phosphor-icons/react'

interface CreateSupplierDialogProps {
  onSuccess?: (supplier: any) => void
  children?: React.ReactNode
  initialData?: Partial<SupplierFormData>
}

interface SupplierFormData {
  // Basic Info
  name: string
  contactEmail: string
  contactPhone: string
  website: string
  address: string
  
  // Business Details
  priority: string
  currency: string
  paymentTerms: string
  
  // Additional
  notes: string
}

const INITIAL_FORM_DATA: SupplierFormData = {
  name: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
  address: '',
  priority: 'medium',
  currency: 'USD',
  paymentTerms: 'Net 30',
  notes: ''
}

const CATEGORIES = [
  'Electronics',
  'Clothing & Apparel',
  'Food & Beverage',
  'Home & Garden',
  'Health & Beauty',
  'Sports & Outdoors',
  'Toys & Games',
  'Books & Media',
  'Office Supplies',
  'Industrial',
  'Other'
]

const PAYMENT_TERMS = [
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
  'Net 90',
  'Due on Receipt',
  'COD (Cash on Delivery)',
  '2/10 Net 30',
  'Custom'
]

export default function CreateSupplierDialog({ onSuccess, children, initialData }: CreateSupplierDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<SupplierFormData>(INITIAL_FORM_DATA)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form data ONLY when dialog opens (not on every render)
  useEffect(() => {
    if (isOpen) {
      // Only reset when opening, merge with initialData
      setFormData({
        ...INITIAL_FORM_DATA,
        ...initialData
      })
    }
  }, [isOpen]) // Only depend on isOpen, not initialData

  const totalSteps = 3
  const progress = (currentStep / totalSteps) * 100

  // Update form field
  const updateField = (field: keyof SupplierFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  // Validate step
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 1) {
      if (!formData.name.trim()) {
        newErrors.name = 'Supplier name is required'
      }
      if (!formData.contactEmail.trim()) {
        newErrors.contactEmail = 'Contact email is required'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
        newErrors.contactEmail = 'Invalid email format'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Navigate steps
  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps))
    }
  }

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  // Submit form
  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return

    setIsSubmitting(true)
    try {
      const result = await authenticatedRequest('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          contactEmail: formData.contactEmail,
          contactPhone: formData.contactPhone || null,
          website: formData.website || null,
          address: formData.address || null,
          status: 'active',
          priority: formData.priority,
          connectionType: 'manual'
        })
      })

      if (result.success && result.data) {
        // Success!
        setIsOpen(false)
        setFormData(INITIAL_FORM_DATA)
        setCurrentStep(1)
        onSuccess?.(result.data)
      } else {
        setErrors({ submit: result.error || 'Failed to create supplier' })
      }
    } catch (error) {
      console.error('Error creating supplier:', error)
      setErrors({ submit: 'Network error. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset form when dialog closes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      setFormData(INITIAL_FORM_DATA)
      setCurrentStep(1)
      setErrors({})
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30 transition-all duration-300">
            <Plus className="w-4 h-4 mr-2" />
            Add Supplier
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0 gap-0 bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        {/* Modern Header with Gradient */}
        <DialogHeader className="relative px-6 pt-6 pb-4 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,rgba(255,255,255,0.6))]" />
          <div className="relative flex items-center gap-4">
            <motion.div 
              className="p-3 rounded-2xl bg-white/20 backdrop-blur-xl shadow-lg"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", duration: 0.6 }}
            >
              <Building className="w-7 h-7 text-white" weight="duotone" />
            </motion.div>
            <div>
              <DialogTitle className="text-2xl font-bold text-white">Add New Supplier</DialogTitle>
              <DialogDescription className="text-blue-100">
                Step {currentStep} of {totalSteps}: {
                  currentStep === 1 ? 'Basic Information' :
                  currentStep === 2 ? 'Business Details' :
                  'Review & Confirm'
                }
              </DialogDescription>
            </div>
          </div>
          
          {/* Modern Step Indicators */}
          <div className="relative mt-6 flex items-center justify-between">
            {[1, 2, 3].map((step, idx) => (
              <div key={step} className="relative flex-1 flex items-center">
                <motion.div
                  initial={false}
                  animate={{
                    scale: currentStep === step ? 1.1 : 1,
                  }}
                  className="relative z-10 flex items-center justify-center"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all duration-300 ${
                    currentStep > step 
                      ? 'bg-green-400 text-white shadow-lg shadow-green-500/50' 
                      : currentStep === step
                      ? 'bg-white text-blue-600 shadow-xl shadow-white/50 ring-4 ring-white/30'
                      : 'bg-white/20 text-white/60 backdrop-blur-sm'
                  }`}>
                    {currentStep > step ? (
                      <CheckCircle className="w-5 h-5" weight="fill" />
                    ) : (
                      <span>{step}</span>
                    )}
                  </div>
                </motion.div>
                {idx < 2 && (
                  <div className="flex-1 h-1 mx-2 bg-white/20 rounded-full overflow-hidden">
                    <motion.div
                      initial={false}
                      animate={{
                        width: currentStep > step ? '100%' : '0%'
                      }}
                      transition={{ duration: 0.4 }}
                      className="h-full bg-gradient-to-r from-green-400 to-emerald-400"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3 text-xs">
            <span className={`font-medium transition-colors ${currentStep >= 1 ? 'text-white' : 'text-blue-200'}`}>Basic Info</span>
            <span className={`font-medium transition-colors ${currentStep >= 2 ? 'text-white' : 'text-blue-200'}`}>Business</span>
            <span className={`font-medium transition-colors ${currentStep >= 3 ? 'text-white' : 'text-blue-200'}`}>Review</span>
          </div>
        </DialogHeader>

        {/* Scrollable Form Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[calc(90vh-280px)]">
          {/* Form Steps */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              {/* Step 1: Basic Information */}
              {currentStep === 1 && (
                <div className="space-y-5">
                  {/* Company Name Field with Modern Card */}
                  <div className="p-5 rounded-xl bg-white shadow-sm border border-slate-200/60 hover:shadow-md transition-shadow duration-300">
                    <Label htmlFor="name" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                      <Building className="w-4 h-4 text-blue-600" weight="duotone" />
                      Supplier Name *
                    </Label>
                    <Input
                      id="name"
                      placeholder="e.g., Acme Electronics Inc."
                      value={formData.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      className={`h-11 border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all ${errors.name ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                    />
                    {errors.name && (
                      <motion.p 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-red-600 mt-2 flex items-center gap-1"
                      >
                        <Warning className="w-3 h-3" />
                        {errors.name}
                      </motion.p>
                    )}
                  </div>

                  {/* Contact Information Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 rounded-xl bg-white shadow-sm border border-slate-200/60 hover:shadow-md transition-shadow duration-300">
                      <Label htmlFor="contactEmail" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                        <Envelope className="w-4 h-4 text-blue-600" weight="duotone" />
                        Contact Email *
                      </Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        placeholder="supplier@example.com"
                        value={formData.contactEmail}
                        onChange={(e) => updateField('contactEmail', e.target.value)}
                        className={`h-11 border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all ${errors.contactEmail ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                      />
                      {errors.contactEmail && (
                        <motion.p 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm text-red-600 mt-2 flex items-center gap-1"
                        >
                          <Warning className="w-3 h-3" />
                          {errors.contactEmail}
                        </motion.p>
                      )}
                    </div>

                    <div className="p-5 rounded-xl bg-white shadow-sm border border-slate-200/60 hover:shadow-md transition-shadow duration-300">
                      <Label htmlFor="contactPhone" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                        <Phone className="w-4 h-4 text-blue-600" weight="duotone" />
                        Contact Phone
                      </Label>
                      <Input
                        id="contactPhone"
                        type="tel"
                        placeholder="+1 (555) 123-4567"
                        value={formData.contactPhone}
                        onChange={(e) => updateField('contactPhone', e.target.value)}
                        className="h-11 border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      />
                    </div>
                  </div>

                  {/* Website & Address */}
                  <div className="p-5 rounded-xl bg-white shadow-sm border border-slate-200/60 hover:shadow-md transition-shadow duration-300">
                    <Label htmlFor="website" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                      <Globe className="w-4 h-4 text-indigo-600" weight="duotone" />
                      Website
                    </Label>
                    <Input
                      id="website"
                      type="url"
                      placeholder="https://www.supplier.com"
                      value={formData.website}
                      onChange={(e) => updateField('website', e.target.value)}
                      className="h-11 border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    />
                  </div>

                  <div className="p-5 rounded-xl bg-white shadow-sm border border-slate-200/60 hover:shadow-md transition-shadow duration-300">
                    <Label htmlFor="address" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                      <MapPin className="w-4 h-4 text-purple-600" weight="duotone" />
                      Business Address
                    </Label>
                    <Textarea
                      id="address"
                      placeholder="123 Main Street, Suite 100, City, State, ZIP"
                      value={formData.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      rows={2}
                      className="border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all resize-none"
                    />
                  </div>

                  {/* Info Box */}
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/50 rounded-xl p-4 flex items-start gap-3 shadow-sm"
                  >
                    <Lightning className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" weight="duotone" />
                    <div className="text-sm">
                      <p className="font-semibold text-blue-900 mb-1">💡 Quick Tip</p>
                      <p className="text-blue-700">
                        Accurate contact information helps ensure smooth communication and automated order processing.
                      </p>
                    </div>
                  </motion.div>
                </div>
              )}

              {/* Step 2: Business Details */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  {/* Modern Grid Cards for Business Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm border border-amber-200/50 hover:shadow-md transition-all duration-300">
                      <Label htmlFor="priority" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                        <Lightning className="w-4 h-4 text-amber-600" weight="duotone" />
                        Priority Level
                      </Label>
                      <Select
                        value={formData.priority}
                        onValueChange={(value) => updateField('priority', value)}
                      >
                        <SelectTrigger className="h-11 border-amber-200 bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                              Low Priority
                            </div>
                          </SelectItem>
                          <SelectItem value="medium">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                              Medium Priority
                            </div>
                          </SelectItem>
                          <SelectItem value="high">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-red-400"></div>
                              High Priority
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-amber-700 mt-2">
                        ⚡ High priority suppliers get faster processing
                      </p>
                    </div>

                    <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 shadow-sm border border-emerald-200/50 hover:shadow-md transition-all duration-300">
                      <Label htmlFor="currency" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                        <CreditCard className="w-4 h-4 text-emerald-600" weight="duotone" />
                        Currency
                      </Label>
                      <Select
                        value={formData.currency}
                        onValueChange={(value) => updateField('currency', value)}
                      >
                        <SelectTrigger className="h-11 border-emerald-200 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">💵 USD ($)</SelectItem>
                          <SelectItem value="EUR">💶 EUR (€)</SelectItem>
                          <SelectItem value="GBP">💷 GBP (£)</SelectItem>
                          <SelectItem value="CAD">🍁 CAD ($)</SelectItem>
                          <SelectItem value="AUD">🦘 AUD ($)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Payment Terms */}
                  <div className="p-5 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 shadow-sm border border-violet-200/50 hover:shadow-md transition-all duration-300">
                    <Label htmlFor="paymentTerms" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                      <Clock className="w-4 h-4 text-violet-600" weight="duotone" />
                      Payment Terms
                    </Label>
                    <Select
                      value={formData.paymentTerms}
                      onValueChange={(value) => updateField('paymentTerms', value)}
                    >
                      <SelectTrigger className="h-11 border-violet-200 bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_TERMS.map(term => (
                          <SelectItem key={term} value={term}>
                            📅 {term}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Notes Field */}
                  <div className="p-5 rounded-xl bg-white shadow-sm border border-slate-200/60 hover:shadow-md transition-all duration-300">
                    <Label htmlFor="notes" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                      <User className="w-4 h-4 text-slate-600" weight="duotone" />
                      Notes (Optional)
                    </Label>
                    <Textarea
                      id="notes"
                      placeholder="Any additional information about this supplier..."
                      value={formData.notes}
                      onChange={(e) => updateField('notes', e.target.value)}
                      rows={3}
                      className="border-slate-200 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 transition-all resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Review & Confirm */}
              {currentStep === 3 && (
                <div className="space-y-5">
                  {/* Success Banner */}
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200/50 rounded-xl p-5 flex items-start gap-4 shadow-sm"
                  >
                    <div className="p-2 rounded-lg bg-green-100">
                      <CheckCircle className="w-6 h-6 text-green-600" weight="fill" />
                    </div>
                    <div>
                      <h4 className="font-bold text-green-900 mb-1">✨ Almost Done!</h4>
                      <p className="text-sm text-green-700">
                        Review the information below and click "Create Supplier" to finish.
                      </p>
                    </div>
                  </motion.div>

                  {/* Modern Review Cards */}
                  <div className="space-y-4">
                    {/* Basic Info Card */}
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                      className="rounded-xl bg-gradient-to-br from-white to-blue-50/30 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
                    >
                      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3">
                        <h4 className="font-semibold text-white flex items-center gap-2">
                          <Building className="w-4 h-4" weight="duotone" />
                          Basic Information
                        </h4>
                      </div>
                      <div className="p-5">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-500 mb-1">Supplier Name</span>
                            <span className="font-semibold text-slate-900">{formData.name}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-500 mb-1">Contact Email</span>
                            <span className="font-medium text-slate-700">{formData.contactEmail}</span>
                          </div>
                          {formData.contactPhone && (
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-500 mb-1">Phone</span>
                              <span className="font-medium text-slate-700">{formData.contactPhone}</span>
                            </div>
                          )}
                          {formData.website && (
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-500 mb-1">Website</span>
                              <span className="font-medium text-blue-600 hover:underline truncate">
                                {formData.website}
                              </span>
                            </div>
                          )}
                        </div>
                        {formData.address && (
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <span className="text-xs text-slate-500 block mb-1">Business Address</span>
                            <p className="text-sm text-slate-700">{formData.address}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>

                    {/* Business Details Card */}
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="rounded-xl bg-gradient-to-br from-white to-purple-50/30 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
                    >
                      <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-3">
                        <h4 className="font-semibold text-white flex items-center gap-2">
                          <Lightning className="w-4 h-4" weight="duotone" />
                          Business Details
                        </h4>
                      </div>
                      <div className="p-5">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-500 mb-2">Priority Level</span>
                            <Badge 
                              variant="outline" 
                              className={`capitalize w-fit ${
                                formData.priority === 'high' ? 'border-red-300 bg-red-50 text-red-700' :
                                formData.priority === 'medium' ? 'border-blue-300 bg-blue-50 text-blue-700' :
                                'border-slate-300 bg-slate-50 text-slate-700'
                              }`}
                            >
                              {formData.priority}
                            </Badge>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-500 mb-1">Currency</span>
                            <span className="font-semibold text-slate-900">{formData.currency}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-500 mb-1">Payment Terms</span>
                            <span className="font-medium text-slate-700">{formData.paymentTerms}</span>
                          </div>
                        </div>
                        {formData.notes && (
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <span className="text-xs text-slate-500 block mb-1">Additional Notes</span>
                            <p className="text-sm text-slate-700">{formData.notes}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>

                  {errors.submit && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 flex items-center gap-2"
                    >
                      <Warning className="w-5 h-5 flex-shrink-0" weight="fill" />
                      {errors.submit}
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Modern Footer with Action Buttons */}
        <div className="px-6 pb-6 pt-4 border-t bg-gradient-to-b from-transparent to-slate-50/50">
          <div className="flex justify-between items-center gap-4">
            {/* Back Button */}
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1 || isSubmitting}
              className="gap-2 border-slate-300 hover:bg-slate-50 disabled:opacity-40"
            >
              <ArrowLeft className="w-4 h-4" weight="bold" />
              Back
            </Button>

            {/* Right Side Actions */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
                className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              >
                Cancel
              </Button>

              {currentStep < totalSteps ? (
                <Button 
                  type="button" 
                  onClick={nextStep}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30 transition-all duration-300 gap-2"
                >
                  Next Step
                  <ArrowRight className="w-4 h-4" weight="bold" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="min-w-[160px] bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-500/30 transition-all duration-300"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" weight="fill" />
                      Create Supplier
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
