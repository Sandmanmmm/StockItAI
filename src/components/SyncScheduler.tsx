import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Calendar,
  Clock,
  Check,
  Warning,
  X,
  Play,
  Pause,
  Gear
} from '@phosphor-icons/react'
import { useKV } from '../hooks/useKV'
import { toast } from 'sonner'
import { ScheduleConfigDialog } from './ScheduleConfigDialog'
import { safeFormatDateTime, safeFormatDate } from '@/lib/utils'

interface SyncSchedule {
  id: string
  supplier: string
  frequency: 'daily' | 'weekly' | 'monthly'
  time: string
  enabled: boolean
  lastSync: string // ISO string timestamp
  nextSync: string // ISO string timestamp
  status: 'success' | 'warning' | 'error' | 'pending'
  itemsUpdated: number
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 }
}

export function SyncScheduler() {
  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [schedules, setSchedules] = useKV<SyncSchedule[]>('sync-schedules', [
    {
      id: '1',
      supplier: 'TechnoSupply Co.',
      frequency: 'daily',
      time: '09:00',
      enabled: true,
      lastSync: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
      nextSync: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(), // 20 hours from now
      status: 'success',
      itemsUpdated: 147
    },
    {
      id: '2',
      supplier: 'Global Parts Ltd.',
      frequency: 'weekly',
      time: '14:30',
      enabled: true,
      lastSync: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      nextSync: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
      status: 'warning',
      itemsUpdated: 23
    },
    {
      id: '3',
      supplier: 'Premier Wholesale',
      frequency: 'daily',
      time: '16:00',
      enabled: false,
      lastSync: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
      nextSync: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours from now
      status: 'error',
      itemsUpdated: 0
    }
  ])

  const toggleScheduleEnabled = (id: string) => {
    setSchedules((current) => 
      (current || []).map(schedule => 
        schedule.id === id 
          ? { ...schedule, enabled: !schedule.enabled }
          : schedule
      )
    )
    toast.success('Schedule updated successfully')
  }

  const updateScheduleFrequency = (id: string, frequency: string) => {
    setSchedules((current) => 
      (current || []).map(schedule => 
        schedule.id === id 
          ? { ...schedule, frequency: frequency as SyncSchedule['frequency'] }
          : schedule
      )
    )
    toast.success('Frequency updated')
  }

  const runSyncNow = (id: string, supplier: string) => {
    toast.success(`Manual sync started for ${supplier}`)
  }

  const handleCreateSchedule = (config: any) => {
    try {
      const now = Date.now()
      const oneDayMs = 24 * 60 * 60 * 1000
      const oneHourMs = 60 * 60 * 1000
      
      const newSchedule: SyncSchedule = {
        id: now.toString(),
        supplier: config.supplierName || 'Unknown Supplier',
        frequency: config.frequency === 'hourly' ? 'daily' : config.frequency, // Map hourly to daily for now
        time: config.time || '09:00',
        enabled: config.enabled ?? true,
        lastSync: new Date(now - oneDayMs).toISOString(), // Yesterday
        nextSync: new Date(now + (config.frequency === 'hourly' ? oneHourMs : oneDayMs)).toISOString(),
        status: 'pending',
        itemsUpdated: 0
      }
      
      setSchedules((current) => [...(current || []), newSchedule])
      toast.success(`Schedule created for ${config.supplierName || 'supplier'}`)
    } catch (error) {
      console.error('Error creating schedule:', error)
      toast.error('Failed to create schedule. Please try again.')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge variant="default" className="gap-1 bg-success text-success-foreground">
            <Check className="w-3 h-3" />
            Success
          </Badge>
        )
      case 'warning':
        return (
          <Badge variant="secondary" className="gap-1 bg-warning text-warning-foreground">
            <Warning className="w-3 h-3" />
            Warning
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <X className="w-3 h-3" />
            Error
          </Badge>
        )
      case 'pending':
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </Badge>
        )
      default:
        return null
    }
  }

  const formatTimeUntilNext = (nextSync: string | null | undefined) => {
    if (!nextSync) return 'Not scheduled'
    
    try {
      const now = new Date()
      const syncDate = new Date(nextSync)
      
      // Check if the date is valid
      if (isNaN(syncDate.getTime())) return 'Invalid date'
      
      const diff = syncDate.getTime() - now.getTime()
      
      // If the sync time has passed, show overdue
      if (diff < 0) {
        const overdueDays = Math.abs(Math.floor(diff / (1000 * 60 * 60 * 24)))
        return overdueDays > 0 ? `${overdueDays}d overdue` : 'Overdue'
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const days = Math.floor(hours / 24)
      
      if (days > 0) {
        return `${days}d ${hours % 24}h`
      } else if (hours > 0) {
        return `${hours}h`
      } else {
        const minutes = Math.floor(diff / (1000 * 60))
        return minutes > 0 ? `${minutes}m` : 'Soon'
      }
    } catch (error) {
      console.error('Error formatting time until next sync:', error)
      return 'Invalid date'
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sync Scheduler</h2>
          <p className="text-muted-foreground">
            Manage automated supplier synchronization schedules
          </p>
        </div>
        <Button onClick={() => setShowConfigDialog(true)}>
          <Calendar className="w-4 h-4 mr-2" />
          Add New Schedule
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <motion.div variants={cardVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Schedules</CardTitle>
              <Play className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(schedules || []).filter(s => s.enabled).length}
              </div>
              <p className="text-xs text-muted-foreground">
                of {(schedules || []).length} total
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Next Sync</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(() => {
                  const enabledSchedules = (schedules || []).filter(s => s.enabled)
                  if (enabledSchedules.length === 0) return 'None'
                  
                  try {
                    const nextSchedule = enabledSchedules
                      .map(s => ({
                        ...s,
                        nextSyncDate: s.nextSync ? new Date(s.nextSync) : null
                      }))
                      .filter(s => s.nextSyncDate && !isNaN(s.nextSyncDate.getTime()))
                      .sort((a, b) => a.nextSyncDate!.getTime() - b.nextSyncDate!.getTime())[0]
                    
                    return nextSchedule ? formatTimeUntilNext(nextSchedule.nextSync) : 'None'
                  } catch (error) {
                    console.error('Error calculating next sync:', error)
                    return 'Error'
                  }
                })()}
              </div>
              <p className="text-xs text-muted-foreground">
                Until next automated sync
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <Check className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">92%</div>
              <p className="text-xs text-muted-foreground">
                Last 30 days
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Schedule List */}
      <motion.div variants={cardVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Supplier Sync Schedules</CardTitle>
            <CardDescription>
              Configure when and how often to sync inventory with each supplier
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(schedules || []).map((schedule, index) => (
                <motion.div
                  key={schedule.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={schedule.enabled}
                      onCheckedChange={() => toggleScheduleEnabled(schedule.id)}
                    />
                    <div>
                      <div className="font-medium">{schedule.supplier}</div>
                      <div className="text-sm text-muted-foreground">
                        Last sync: {safeFormatDateTime(schedule.lastSync)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Select
                        value={schedule.frequency}
                        onValueChange={(value) => updateScheduleFrequency(schedule.id, value)}
                      >
                        <SelectTrigger className="w-24 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">
                        at {schedule.time}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-medium">
                        Next: {formatTimeUntilNext(schedule.nextSync)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {schedule.itemsUpdated} items last sync
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusBadge(schedule.status)}
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => runSyncNow(schedule.id, schedule.supplier)}
                          className="h-8 w-8 p-0"
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <Gear className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Upcoming Syncs */}
      <motion.div variants={cardVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Syncs</CardTitle>
            <CardDescription>
              Next scheduled synchronizations across all suppliers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(schedules || [])
                .filter(s => s.enabled && s.nextSync)
                .map(s => ({
                  ...s,
                  nextSyncDate: s.nextSync ? new Date(s.nextSync) : null
                }))
                .filter(s => s.nextSyncDate && !isNaN(s.nextSyncDate.getTime()))
                .sort((a, b) => a.nextSyncDate!.getTime() - b.nextSyncDate!.getTime())
                .slice(0, 5)
                .map((schedule, index) => (
                  <div
                    key={schedule.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="font-medium">{schedule.supplier}</span>
                      <Badge variant="outline" className="text-xs">
                        {schedule.frequency}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {safeFormatDate(schedule.nextSync)} at {schedule.time}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        in {formatTimeUntilNext(schedule.nextSync)}
                      </div>
                    </div>
                  </div>
                ))}
              
              {(schedules || []).filter(s => s.enabled).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No active sync schedules
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Schedule Configuration Dialog */}
      <ScheduleConfigDialog
        open={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        onSave={handleCreateSchedule}
      />
    </motion.div>
  )
}
