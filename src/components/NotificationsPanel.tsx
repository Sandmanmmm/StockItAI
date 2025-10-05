import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  Bell,
  BellSlash,
  Check,
  CheckCircle,
  Warning,
  Info,
  X,
  Trash,
  Gear,
  Funnel,
  CheckFat,
  Clock
} from '@phosphor-icons/react'
import { useKV } from '../hooks/useKV'
import { formatRelativeTime } from '@/lib/utils'

interface NotificationItem {
  id: string
  type: 'success' | 'warning' | 'info' | 'error'
  title: string
  message: string
  timestamp: string // ISO string timestamp
  read: boolean
  category?: 'system' | 'po' | 'sync' | 'ai' | 'user'
  priority?: 'low' | 'medium' | 'high' | 'critical'
  actionable?: boolean
  actionUrl?: string
  actionLabel?: string
}

interface NotificationsPanelProps {
  isOpen: boolean
  onClose: () => void
  onNotificationUpdate: (count: number) => void
  onOpenSettings?: () => void
}

export function NotificationsPanel({ isOpen, onClose, onNotificationUpdate, onOpenSettings }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useKV<NotificationItem[]>('notifications', [
    {
      id: '1',
      type: 'success',
      title: 'PO Processed Successfully',
      message: 'TechnoSupply Co. PO-2024-001 processed with 95% confidence. 24 products updated in inventory.',
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      read: false,
      category: 'po',
      priority: 'medium',
      actionable: true,
      actionUrl: '/po/PO-2024-001',
      actionLabel: 'View Details'
    },
    {
      id: '2',
      type: 'warning',
      title: 'Low Confidence Detection',
      message: 'Premier Wholesale PO requires manual review. AI confidence: 67%. Please verify product mappings.',
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      read: false,
      category: 'ai',
      priority: 'high',
      actionable: true,
      actionUrl: '/review/premier-wholesale',
      actionLabel: 'Review Now'
    },
    {
      id: '3',
      type: 'info',
      title: 'Sync Scheduled',
      message: 'Next supplier sync scheduled for TechnoSupply Co. in 2 hours. All systems ready.',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      read: true,
      category: 'sync',
      priority: 'low'
    },
    {
      id: '4',
      type: 'error',
      title: 'API Connection Failed',
      message: 'Unable to connect to Shopify API. Please check your store credentials and network connection.',
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      read: false,
      category: 'system',
      priority: 'critical',
      actionable: true,
      actionUrl: '/settings/integrations',
      actionLabel: 'Check Settings'
    },
    {
      id: '5',
      type: 'success',
      title: 'Bulk Upload Complete',
      message: '156 products successfully updated from batch upload. Processing time: 3.2 seconds.',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      read: true,
      category: 'po',
      priority: 'medium'
    },
    {
      id: '6',
      type: 'info',
      title: 'AI Model Updated',
      message: 'Purchase Order recognition model updated to v2.1.3. Improved accuracy for multi-page documents.',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      read: false,
      category: 'ai',
      priority: 'low'
    }
  ])

  const [filter, setFilter] = useState<'all' | 'unread' | 'priority'>('all')

  // Update parent component with unread count
  const unreadCount = notifications?.filter(n => !n.read).length || 0
  
  useEffect(() => {
    onNotificationUpdate(unreadCount)
  }, [unreadCount, onNotificationUpdate])

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-success" />
      case 'warning':
        return <Warning className="w-5 h-5 text-warning" />
      case 'error':
        return <X className="w-5 h-5 text-destructive" />
      default:
        return <Info className="w-5 h-5 text-primary" />
    }
  }

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-destructive/10 border-destructive/20 text-destructive'
      case 'high':
        return 'bg-warning/10 border-warning/20 text-warning'
      case 'medium':
        return 'bg-primary/10 border-primary/20 text-primary'
      default:
        return 'bg-muted/50 border-muted text-muted-foreground'
    }
  }

  const getCategoryLabel = (category?: string) => {
    switch (category) {
      case 'system':
        return 'System'
      case 'po':
        return 'Purchase Order'
      case 'sync':
        return 'Sync'
      case 'ai':
        return 'AI Processing'
      case 'user':
        return 'User Action'
      default:
        return 'General'
    }
  }

  const markAsRead = (id: string) => {
    const updatedNotifications = notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    )
    setNotifications(updatedNotifications)
  }

  const markAllAsRead = () => {
    const updatedNotifications = notifications.map(n => ({ ...n, read: true }))
    setNotifications(updatedNotifications)
  }

  const deleteNotification = (id: string) => {
    const updatedNotifications = notifications.filter(n => n.id !== id)
    setNotifications(updatedNotifications)
  }

  const clearAll = () => {
    setNotifications([])
  }

  const filteredNotifications = notifications?.filter(n => {
    switch (filter) {
      case 'unread':
        return !n.read
      case 'priority':
        return n.priority === 'high' || n.priority === 'critical'
      default:
        return true
    }
  }) || []

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Notifications Panel */}
          <motion.div
            className="fixed top-20 right-6 z-50 w-[480px] max-h-[600px] bg-card border border-border rounded-lg shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <Card className="border-0 shadow-none">
              {/* Header */}
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold">
                    Notifications
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {/* Filter Buttons */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant={filter === 'all' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setFilter('all')}
                      >
                        All
                      </Button>
                      <Button
                        variant={filter === 'unread' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setFilter('unread')}
                      >
                        Unread
                        {unreadCount > 0 && (
                          <Badge className="ml-1 h-4 w-4 rounded-full p-0 text-[10px]">
                            {unreadCount}
                          </Badge>
                        )}
                      </Button>
                      <Button
                        variant={filter === 'priority' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setFilter('priority')}
                      >
                        Priority
                      </Button>
                    </div>

                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={markAllAsRead}
                    disabled={unreadCount === 0}
                  >
                    <CheckFat className="w-3 h-3 mr-1" />
                    Mark All Read
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={clearAll}
                    disabled={(notifications?.length || 0) === 0}
                  >
                    <Trash className="w-3 h-3 mr-1" />
                    Clear All
                  </Button>
                </div>
              </CardHeader>

              {/* Content */}
              <ScrollArea className="h-[500px]">
                <CardContent className="p-0">
                  {filteredNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                      <BellSlash className="w-12 h-12 text-muted-foreground mb-3" />
                      <h3 className="font-medium text-foreground mb-1">
                        {filter === 'all' ? 'No notifications' : `No ${filter} notifications`}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {filter === 'all' 
                          ? "You're all caught up! New notifications will appear here."
                          : `No ${filter} notifications at the moment.`
                        }
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredNotifications.map((notification, index) => (
                        <motion.div
                          key={notification.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`relative p-4 border-b border-border hover:bg-muted/30 transition-colors ${
                            !notification.read ? 'bg-primary/5' : ''
                          }`}
                        >
                          {/* Unread Indicator */}
                          {!notification.read && (
                            <div className="absolute left-2 top-6 w-2 h-2 rounded-full bg-primary" />
                          )}

                          <div className="flex gap-3">
                            {/* Icon */}
                            <div className="flex-shrink-0 mt-0.5">
                              {getNotificationIcon(notification.type)}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm text-foreground leading-tight">
                                    {notification.title}
                                  </h4>
                                  
                                  {/* Metadata */}
                                  <div className="flex items-center gap-2 mt-1 mb-2">
                                    <Badge variant="outline" className="text-xs h-5 px-1.5">
                                      {getCategoryLabel(notification.category)}
                                    </Badge>
                                    {notification.priority && (
                                      <Badge variant="outline" className={`text-xs h-5 px-1.5 ${getPriorityColor(notification.priority)}`}>
                                        {notification.priority}
                                      </Badge>
                                    )}
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatRelativeTime(notification.timestamp)}
                                    </span>
                                  </div>
                                  
                                  <p className="text-sm text-muted-foreground leading-relaxed">
                                    {notification.message}
                                  </p>

                                  {/* Action Button */}
                                  {notification.actionable && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="mt-3 h-7 text-xs"
                                    >
                                      {notification.actionLabel || 'View Details'}
                                    </Button>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-1">
                                  {!notification.read && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => markAsRead(notification.id)}
                                    >
                                      <Check className="w-3 h-3" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => deleteNotification(notification.id)}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </ScrollArea>

              {/* Footer */}
              <div className="border-t border-border p-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    onClose()
                    onOpenSettings?.()
                  }}
                >
                  <Gear className="w-3 h-3 mr-1" />
                  Notification Settings
                </Button>
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
