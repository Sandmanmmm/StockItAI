import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { 
  Lightning, 
  Check, 
  Warning, 
  X, 
  Clock,
  Database,
  ArrowsClockwise,
  FileText,
  Users,
  TrendUp,
  Robot,
  Globe,
  Package,
  ChartLine,
  Shield
} from '@phosphor-icons/react'
import { useKV } from '../hooks/useKV'

interface SyncStep {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  duration?: number
  details?: string
  itemsProcessed?: number
  totalItems?: number
}

interface SupplierSync {
  id: string
  name: string
  status: 'pending' | 'syncing' | 'completed' | 'failed'
  progress: number
  itemsUpdated: number
  totalItems: number
  lastSync?: string
  errors?: string[]
}

export function QuickSync({ onClose }: { onClose: () => void }) {
  const [isRunning, setIsRunning] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [overallProgress, setOverallProgress] = useState(0)
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  
  const [syncSteps, setSyncSteps] = useState<SyncStep[]>([
    {
      id: '1',
      name: 'Initialize Sync Engine',
      description: 'Preparing AI processing pipeline',
      status: 'pending'
    },
    {
      id: '2', 
      name: 'Validate Supplier Connections',
      description: 'Checking API endpoints and credentials',
      status: 'pending'
    },
    {
      id: '3',
      name: 'Fetch Purchase Orders',
      description: 'Retrieving latest POs from suppliers',
      status: 'pending'
    },
    {
      id: '4',
      name: 'AI Document Processing',
      description: 'Extracting data with 95%+ accuracy',
      status: 'pending'
    },
    {
      id: '5',
      name: 'Update Shopify Inventory',
      description: 'Syncing product data and pricing',
      status: 'pending'
    },
    {
      id: '6',
      name: 'Generate Reports',
      description: 'Creating sync summary and alerts',
      status: 'pending'
    }
  ])

  const [suppliers, setSuppliers] = useState<SupplierSync[]>([
    {
      id: '1',
      name: 'TechnoSupply Co.',
      status: 'pending',
      progress: 0,
      itemsUpdated: 0,
      totalItems: 156,
      lastSync: '2024-01-20T10:30:00Z'
    },
    {
      id: '2',
      name: 'Premier Wholesale',
      status: 'pending', 
      progress: 0,
      itemsUpdated: 0,
      totalItems: 89,
      lastSync: '2024-01-20T09:15:00Z'
    },
    {
      id: '3',
      name: 'Global Electronics Ltd',
      status: 'pending',
      progress: 0,
      itemsUpdated: 0,
      totalItems: 203,
      lastSync: '2024-01-20T08:45:00Z'
    },
    {
      id: '4',
      name: 'Innovation Parts Inc',
      status: 'pending',
      progress: 0,
      itemsUpdated: 0,
      totalItems: 67,
      lastSync: '2024-01-19T16:20:00Z'
    }
  ])

  // Timer for elapsed time
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isRunning && startTime) {
      timer = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime.getTime()) / 1000))
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [isRunning, startTime])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const startSync = async () => {
    setIsRunning(true)
    setStartTime(new Date())
    setCurrentStep(0)
    setOverallProgress(0)

    // Show start notification
    toast.success('Quick Sync Started', {
      description: 'AI-powered synchronization is now running across all suppliers'
    })

    // Reset all states
    setSyncSteps(prev => prev.map(step => ({ ...step, status: 'pending' })))
    setSuppliers(prev => prev.map(sup => ({ 
      ...sup, 
      status: 'pending', 
      progress: 0, 
      itemsUpdated: 0 
    })))

    // Simulate sync process
    for (let i = 0; i < syncSteps.length; i++) {
      setCurrentStep(i)
      
      // Update current step to running
      setSyncSteps(prev => prev.map((step, idx) => 
        idx === i 
          ? { ...step, status: 'running' }
          : idx < i 
            ? { ...step, status: 'completed' }
            : step
      ))

      // Simulate step duration with realistic timing
      const stepDuration = 1500 + Math.random() * 2500
      await new Promise(resolve => setTimeout(resolve, stepDuration))

      // Update step details based on step type
      if (i === 2) { // Fetch POs step
        setSyncSteps(prev => prev.map((step, idx) => 
          idx === i ? { ...step, itemsProcessed: 24, totalItems: 24 } : step
        ))
        
        toast.info('Purchase Orders Retrieved', {
          description: '24 POs collected from all suppliers'
        })
      }

      if (i === 3) { // AI Processing step
        // Start supplier syncing
        setSuppliers(prev => prev.map(sup => ({ ...sup, status: 'syncing' })))
        
        toast.info('AI Processing Started', {
          description: 'Advanced document analysis in progress'
        })
        
        // Simulate supplier progress with realistic timing
        for (let progress = 0; progress <= 100; progress += 5) {
          await new Promise(resolve => setTimeout(resolve, 150))
          setSuppliers(prev => prev.map(sup => ({
            ...sup,
            progress,
            itemsUpdated: Math.floor((progress / 100) * sup.totalItems)
          })))
        }
        
        setSuppliers(prev => prev.map(sup => ({ ...sup, status: 'completed' })))
      }

      if (i === 4) { // Shopify update step
        toast.success('Inventory Updated', {
          description: `${totalItems} products synchronized with Shopify`
        })
      }

      // Complete current step
      setSyncSteps(prev => prev.map((step, idx) => 
        idx === i ? { 
          ...step, 
          status: 'completed', 
          duration: stepDuration / 1000
        } : step
      ))

      // Update overall progress
      setOverallProgress((i + 1) / syncSteps.length * 100)
    }

    // Complete sync
    setIsRunning(false)
    
    toast.success('Quick Sync Completed!', {
      description: `Successfully updated ${totalItems} items across ${suppliers.length} suppliers`
    })
  }

  const getStepIcon = (status: SyncStep['status']) => {
    switch (status) {
      case 'completed':
        return <Check className="w-5 h-5 text-success" />
      case 'running':
        return <ArrowsClockwise className="w-5 h-5 text-primary animate-spin" />
      case 'failed':
        return <X className="w-5 h-5 text-destructive" />
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />
    }
  }

  const getSupplierStatusIcon = (status: SupplierSync['status']) => {
    switch (status) {
      case 'completed':
        return <Check className="w-4 h-4 text-success" />
      case 'syncing':
        return <ArrowsClockwise className="w-4 h-4 text-primary animate-spin" />
      case 'failed':
        return <X className="w-4 h-4 text-destructive" />
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />
    }
  }

  const totalItemsUpdated = suppliers.reduce((sum, sup) => sum + sup.itemsUpdated, 0)
  const totalItems = suppliers.reduce((sum, sup) => sum + sup.totalItems, 0)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <Card className="w-full max-w-7xl max-h-[90vh] mx-4 shadow-2xl">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-accent/5 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Lightning className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">Quick Sync</CardTitle>
                <CardDescription>
                  AI-powered inventory synchronization across all suppliers
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Overall Progress */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold text-lg">Sync Progress</h3>
                <p className="text-sm text-muted-foreground">
                  {isRunning ? `Step ${currentStep + 1} of ${syncSteps.length}` : 'Ready to start'}
                </p>
              </div>
              <div className="text-right space-y-1">
                <div className="text-2xl font-bold">{Math.round(overallProgress)}%</div>
                <div className="text-sm text-muted-foreground">
                  {isRunning ? `${formatTime(elapsedTime)} elapsed` : 'Not started'}
                </div>
              </div>
            </div>
            <Progress value={overallProgress} className="h-3" />
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/10">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                <div>
                  <div className="text-lg font-semibold">{totalItemsUpdated}</div>
                  <div className="text-xs text-muted-foreground">Items Updated</div>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-accent/5 to-accent/10 border-accent/10">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                <div>
                  <div className="text-lg font-semibold">{suppliers.length}</div>
                  <div className="text-xs text-muted-foreground">Suppliers</div>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-success/5 to-success/10 border-success/10">
              <div className="flex items-center gap-2">
                <Robot className="w-5 h-5 text-success" />
                <div>
                  <div className="text-lg font-semibold">94.2%</div>
                  <div className="text-xs text-muted-foreground">AI Accuracy</div>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 border-muted">
              <div className="flex items-center gap-2">
                <ChartLine className="w-5 h-5 text-foreground" />
                <div>
                  <div className="text-lg font-semibold">{Math.round(overallProgress)}%</div>
                  <div className="text-xs text-muted-foreground">Complete</div>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sync Steps */}
            <div className="space-y-4">
              <h4 className="font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Processing Steps
              </h4>
              <ScrollArea className="h-[300px]">
                <div className="space-y-3 pr-4">
                  {syncSteps.map((step, index) => (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`p-4 rounded-lg border transition-all ${
                        step.status === 'running' ? 'border-primary bg-primary/5 shadow-md scale-[1.02]' :
                        step.status === 'completed' ? 'border-success/20 bg-success/5' :
                        step.status === 'failed' ? 'border-destructive/20 bg-destructive/5' :
                        'border-muted bg-muted/20'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {getStepIcon(step.status)}
                        <div className="flex-1">
                          <div className="font-medium">{step.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {step.description}
                          </div>
                          {step.duration && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Completed in {step.duration.toFixed(1)}s
                            </div>
                          )}
                          {step.itemsProcessed && (
                            <div className="text-xs text-primary mt-1">
                              {step.itemsProcessed}/{step.totalItems} items processed
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Supplier Status */}
            <div className="space-y-4">
              <h4 className="font-semibold flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Supplier Status
              </h4>
              <ScrollArea className="h-[300px]">
                <div className="space-y-3 pr-4">
                  {suppliers.map((supplier, index) => (
                    <motion.div
                      key={supplier.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`p-4 rounded-lg border transition-all ${
                        supplier.status === 'syncing' ? 'border-primary bg-primary/5 shadow-md scale-[1.01]' :
                        supplier.status === 'completed' ? 'border-success/20 bg-success/5' :
                        'border-muted bg-muted/20'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getSupplierStatusIcon(supplier.status)}
                            <span className="font-medium">{supplier.name}</span>
                          </div>
                          <Badge variant={
                            supplier.status === 'completed' ? 'default' :
                            supplier.status === 'syncing' ? 'secondary' : 'outline'
                          }>
                            {supplier.status}
                          </Badge>
                        </div>
                        
                        {supplier.status === 'syncing' || supplier.status === 'completed' ? (
                          <>
                            <Progress value={supplier.progress} className="h-2" />
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                {supplier.itemsUpdated}/{supplier.totalItems} items
                              </span>
                              <span className="font-medium">{supplier.progress}%</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {supplier.totalItems} items ready for sync
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {!isRunning && overallProgress === 100 ? (
                <div className="flex items-center gap-2 text-success">
                  <Check className="w-4 h-4" />
                  Sync completed successfully in {formatTime(elapsedTime)}
                </div>
              ) : isRunning ? (
                <div className="flex items-center gap-2">
                  <ArrowsClockwise className="w-4 h-4 animate-spin" />
                  Sync in progress...
                </div>
              ) : (
                'Ready to synchronize all suppliers'
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onClose} disabled={isRunning}>
                {isRunning ? 'Close After Sync' : 'Cancel'}
              </Button>
              {!isRunning && overallProgress === 100 ? (
                <Button 
                  onClick={onClose}
                  className="bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Done
                </Button>
              ) : (
                <Button 
                  onClick={startSync} 
                  disabled={isRunning}
                  className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
                >
                  <Lightning className="w-4 h-4 mr-2" />
                  {isRunning ? 'Syncing...' : 'Start Quick Sync'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
