export interface NotificationSettings {
  // General settings
  enabled: boolean
  desktopEnabled: boolean
  soundEnabled: boolean
  
  // Sound settings
  soundVolume: number
  successSound: string
  warningSound: string
  errorSound: string
  infoSound: string
  
  // Type-specific settings
  types: {
    success: boolean
    warning: boolean
    error: boolean
    info: boolean
  }
  
  // Timing settings
  doNotDisturbEnabled: boolean
  doNotDisturbStart: string
  doNotDisturbEnd: string
  
  // Auto-dismiss settings
  autoDismissEnabled: boolean
  autoDismissDelay: number
}

export interface NotificationItem {
  id: string
  type: 'success' | 'warning' | 'info' | 'error'
  title: string
  message: string
  timestamp: string
  read: boolean
  category?: 'system' | 'po' | 'sync' | 'ai' | 'user'
  priority?: 'low' | 'medium' | 'high' | 'critical'
  actionable?: boolean
  actionUrl?: string
  actionLabel?: string
}

class NotificationService {
  private static instance: NotificationService
  private audioContext: AudioContext | null = null
  private settings: NotificationSettings | null = null

  private constructor() {
    // Initialize audio context when first needed
    this.initAudioContext()
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  private initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      // Don't try to resume immediately - wait for user interaction
    } catch (error) {
      console.warn('Web Audio API not supported:', error)
    }
  }

  updateSettings(settings: NotificationSettings) {
    this.settings = settings
  }

  private isDoNotDisturbActive(): boolean {
    if (!this.settings?.doNotDisturbEnabled) return false
    
    const now = new Date()
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    
    const start = this.settings.doNotDisturbStart
    const end = this.settings.doNotDisturbEnd
    
    // Handle overnight do not disturb (e.g., 22:00 to 08:00)
    if (start > end) {
      return currentTime >= start || currentTime <= end
    }
    
    // Handle same-day do not disturb
    return currentTime >= start && currentTime <= end
  }

  private async playNotificationSound(soundType: string) {
    if (!this.settings?.soundEnabled || !this.audioContext || this.settings.soundVolume === 0) {
      return
    }

    try {
      // Resume audio context if suspended (browser requirement)
      if (this.audioContext.state === 'suspended') {
        // Only try to resume if we're in a user interaction context
        try {
          await this.audioContext.resume()
        } catch (resumeError) {
          console.debug('AudioContext resume failed (expected without user interaction):', resumeError)
          return // Silently fail - this is expected behavior
        }
      }

      const volume = this.settings.soundVolume / 100 * 0.3

      // Different sound patterns for each type
      const soundPatterns = {
        chime: { frequencies: [523, 659, 784], durations: [0.3, 0.3, 0.5] }, // C, E, G chord
        bell: { frequencies: [880, 1100], durations: [0.4, 0.6] }, // A, C#
        alert: { frequencies: [1000, 800, 1000], durations: [0.2, 0.2, 0.3] }, // Alert pattern
        soft: { frequencies: [440], durations: [0.5] }, // Simple A note
        none: { frequencies: [], durations: [] }
      }

      const pattern = soundPatterns[soundType as keyof typeof soundPatterns] || soundPatterns.soft
      
      pattern.frequencies.forEach((frequency, index) => {
        const oscillator = this.audioContext!.createOscillator()
        const gainNode = this.audioContext!.createGain()
        
        oscillator.connect(gainNode)
        gainNode.connect(this.audioContext!.destination)
        
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, this.audioContext!.currentTime + index * 0.1)
        
        gainNode.gain.setValueAtTime(0, this.audioContext!.currentTime + index * 0.1)
        gainNode.gain.linearRampToValueAtTime(volume, this.audioContext!.currentTime + index * 0.1 + 0.05)
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext!.currentTime + index * 0.1 + pattern.durations[index])
        
        oscillator.start(this.audioContext!.currentTime + index * 0.1)
        oscillator.stop(this.audioContext!.currentTime + index * 0.1 + pattern.durations[index])
      })
    } catch (error) {
      console.warn('Failed to play notification sound:', error)
    }
  }

  private showDesktopNotification(notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) {
    if (!this.settings?.desktopEnabled || Notification.permission !== 'granted') {
      return
    }

    const desktopNotification = new Notification(notification.title, {
      body: notification.message,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `notification-${Date.now()}`,
      requireInteraction: notification.priority === 'critical',
      silent: !this.settings.soundEnabled // Let our custom sound system handle audio
    })

    // Auto-close desktop notification if enabled
    if (this.settings.autoDismissEnabled && notification.priority !== 'critical') {
      setTimeout(() => {
        desktopNotification.close()
      }, this.settings.autoDismissDelay)
    }

    // Handle notification clicks
    desktopNotification.onclick = () => {
      window.focus()
      if (notification.actionUrl) {
        // In a real app, you'd navigate to the URL
        console.log('Navigate to:', notification.actionUrl)
      }
      desktopNotification.close()
    }
  }

  async show(notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) {
    // Check if notifications are enabled
    if (!this.settings?.enabled) return

    // Check if this notification type is enabled
    if (!this.settings.types[notification.type]) return

    // Check do not disturb
    if (this.isDoNotDisturbActive()) return

    // Generate notification ID and add timestamps
    const fullNotification: NotificationItem = {
      ...notification,
      id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      read: false
    }

    // Play sound based on notification type
    const soundMap = {
      success: this.settings.successSound,
      warning: this.settings.warningSound,
      error: this.settings.errorSound,
      info: this.settings.infoSound
    }
    
    await this.playNotificationSound(soundMap[notification.type])

    // Show desktop notification
    this.showDesktopNotification(notification)

    // Store notification in local storage (KV replacement)
    try {
      const existingNotifications = JSON.parse(localStorage.getItem('notifications') || '[]') as NotificationItem[]
      const updatedNotifications = [fullNotification, ...existingNotifications].slice(0, 50) // Keep only last 50
      localStorage.setItem('notifications', JSON.stringify(updatedNotifications))
    } catch (error) {
      console.warn('Failed to store notification:', error)
    }

    // Trigger UI update (in a real app, you'd use a more sophisticated event system)
    window.dispatchEvent(new CustomEvent('notification-added', { detail: fullNotification }))

    return fullNotification
  }

  // Helper method to show different types of notifications
  async showSuccess(title: string, message: string, options?: Partial<NotificationItem>) {
    return this.show({
      type: 'success',
      title,
      message,
      category: 'system',
      priority: 'medium',
      ...options
    })
  }

  async showWarning(title: string, message: string, options?: Partial<NotificationItem>) {
    return this.show({
      type: 'warning',
      title,
      message,
      category: 'system',
      priority: 'high',
      ...options
    })
  }

  async showError(title: string, message: string, options?: Partial<NotificationItem>) {
    return this.show({
      type: 'error',
      title,
      message,
      category: 'system',
      priority: 'critical',
      ...options
    })
  }

  async showInfo(title: string, message: string, options?: Partial<NotificationItem>) {
    return this.show({
      type: 'info',
      title,
      message,
      category: 'system',
      priority: 'low',
      ...options
    })
  }

  // Request desktop notification permission
  async requestDesktopPermission(): Promise<NotificationPermission> {
    if ('Notification' in window) {
      return await Notification.requestPermission()
    }
    return 'denied'
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance()

// Make it available globally for easy access
declare global {
  interface Window {
    notificationService: NotificationService
  }
}

if (typeof window !== 'undefined') {
  window.notificationService = notificationService
}