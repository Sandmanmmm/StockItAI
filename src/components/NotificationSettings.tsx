import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { 
  Bell, 
  BellRinging, 
  SpeakerHigh, 
  SpeakerX, 
  Desktop,
  Check,
  Warning,
  Info,
  X,
  TestTube,
  SpeakerSimpleHigh,
  Clock
} from '@phosphor-icons/react'
import { useKV } from '../hooks/useKV'
import { toast } from 'sonner'
import { notificationService, NotificationSettings as INotificationSettings } from '@/lib/notificationService'

interface NotificationSettings extends INotificationSettings {}

const defaultSettings: NotificationSettings = {
  enabled: true,
  desktopEnabled: false,
  soundEnabled: true,
  soundVolume: 70,
  successSound: 'chime',
  warningSound: 'bell',
  errorSound: 'alert',
  infoSound: 'soft',
  types: {
    success: true,
    warning: true,
    error: true,
    info: true
  },
  doNotDisturbEnabled: false,
  doNotDisturbStart: '22:00',
  doNotDisturbEnd: '08:00',
  autoDismissEnabled: true,
  autoDismissDelay: 5000
}

const soundOptions = [
  { value: 'chime', label: 'Gentle Chime' },
  { value: 'bell', label: 'Bell' },
  { value: 'alert', label: 'Alert Tone' },
  { value: 'soft', label: 'Soft Ping' },
  { value: 'none', label: 'No Sound' }
]

export function NotificationSettings() {
  const [settings, setSettings] = useKV<NotificationSettings>('notification-settings', defaultSettings)
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission>('default')
  const [testingSound, setTestingSound] = useState<string | null>(null)

  // Ensure settings is never undefined
  const currentSettings = settings || defaultSettings

  useEffect(() => {
    // Update notification service whenever settings change
    notificationService.updateSettings(currentSettings)
  }, [currentSettings])

  useEffect(() => {
    // Check current desktop notification permission
    if ('Notification' in window) {
      setDesktopPermission(Notification.permission)
    }
  }, [])

  const requestDesktopPermission = async () => {
    const permission = await notificationService.requestDesktopPermission()
    setDesktopPermission(permission)
    
    if (permission === 'granted') {
      setSettings({ ...currentSettings, desktopEnabled: true })
      toast.success('Desktop notifications enabled!')
    } else {
      setSettings({ ...currentSettings, desktopEnabled: false })
      toast.error('Desktop notifications denied')
    }
  }

  const playTestSound = (soundType: string) => {
    if (!currentSettings.soundEnabled || currentSettings.soundVolume === 0) return
    
    setTestingSound(soundType)
    
    // Create audio context for sound generation
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      // Set volume
      gainNode.gain.value = currentSettings.soundVolume / 100 * 0.3
      
      // Different frequencies for different sound types
      const frequencies = {
        chime: [523, 659, 784], // C, E, G
        bell: [880, 1100],      // A, C#
        alert: [1000, 800, 1000], // Alert pattern
        soft: [440]             // Simple A note
      }
      
      const freqs = frequencies[soundType as keyof typeof frequencies] || [440]
      
      // Play sequence
      freqs.forEach((freq, index) => {
        const osc = audioContext.createOscillator()
        const gain = audioContext.createGain()
        
        osc.connect(gain)
        gain.connect(audioContext.destination)
        
        osc.frequency.setValueAtTime(freq, audioContext.currentTime + index * 0.1)
        gain.gain.setValueAtTime(0, audioContext.currentTime + index * 0.1)
        gain.gain.linearRampToValueAtTime(currentSettings.soundVolume / 100 * 0.3, audioContext.currentTime + index * 0.1 + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + index * 0.1 + 0.3)
        
        osc.start(audioContext.currentTime + index * 0.1)
        osc.stop(audioContext.currentTime + index * 0.1 + 0.3)
      })
      
      setTimeout(() => setTestingSound(null), 500)
    } catch (error) {
      console.warn('Audio playback failed:', error)
      setTestingSound(null)
    }
  }

  const sendTestNotification = async (type: 'success' | 'warning' | 'error' | 'info') => {
    const messages = {
      success: { title: 'Test Success', message: 'PO processed successfully!' },
      warning: { title: 'Test Warning', message: 'Low confidence detection found' },
      error: { title: 'Test Error', message: 'Failed to process PO' },
      info: { title: 'Test Info', message: 'Sync scheduled for next hour' }
    }
    
    const { title, message } = messages[type]
    
    // Use the notification service to show the test notification
    await notificationService.show({
      type,
      title,
      message,
      category: 'system',
      priority: 'medium'
    })
    
    // Also show a toast for immediate feedback
    const toastFunctions = {
      success: toast.success,
      warning: toast.warning,
      error: toast.error,
      info: toast.info
    }
    toastFunctions[type]('Test notification sent!')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <BellRinging className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Notification Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure how you receive notifications and alerts
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              General Settings
            </CardTitle>
            <CardDescription>
              Control overall notification behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Master Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Enable Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Master switch for all notifications
                </p>
              </div>
              <Switch
                checked={currentSettings.enabled}
                onCheckedChange={(checked) => 
                  setSettings({ ...currentSettings, enabled: checked })
                }
              />
            </div>

            <Separator />

            {/* Desktop Notifications */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium flex items-center gap-2">
                  <Desktop className="w-4 h-4" />
                  Desktop Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Show native desktop notifications
                </p>
                <div className="mt-1">
                  <Badge variant={desktopPermission === 'granted' ? 'default' : 'outline'} className="text-xs">
                    Permission: {desktopPermission}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {desktopPermission !== 'granted' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={requestDesktopPermission}
                    disabled={desktopPermission === 'denied'}
                  >
                    Enable
                  </Button>
                )}
                <Switch
                  checked={currentSettings.desktopEnabled && desktopPermission === 'granted'}
                  onCheckedChange={(checked) => 
                    setSettings({ ...currentSettings, desktopEnabled: checked })
                  }
                  disabled={desktopPermission !== 'granted'}
                />
              </div>
            </div>

            <Separator />

            {/* Auto-dismiss Settings */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">Auto-dismiss Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically close notifications after a delay
                  </p>
                </div>
                <Switch
                  checked={currentSettings.autoDismissEnabled}
                  onCheckedChange={(checked) => 
                    setSettings({ ...currentSettings, autoDismissEnabled: checked })
                  }
                />
              </div>
              
              {currentSettings.autoDismissEnabled && (
                <div className="ml-6 space-y-2">
                  <Label className="text-sm">Dismiss after (seconds)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[currentSettings.autoDismissDelay / 1000]}
                      onValueChange={([value]) => 
                        setSettings({ ...currentSettings, autoDismissDelay: value * 1000 })
                      }
                      min={1}
                      max={30}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono w-12">
                      {currentSettings.autoDismissDelay / 1000}s
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sound Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SpeakerHigh className="w-5 h-5" />
              Sound Settings
            </CardTitle>
            <CardDescription>
              Configure notification sounds and volume
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Sound Toggle & Volume */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Enable Sounds</Label>
                <p className="text-sm text-muted-foreground">
                  Play audio alerts for notifications
                </p>
              </div>
              <Switch
                checked={currentSettings.soundEnabled}
                onCheckedChange={(checked) => 
                  setSettings({ ...currentSettings, soundEnabled: checked })
                }
              />
            </div>

            {currentSettings.soundEnabled && (
              <>
                <Separator />
                
                {/* Volume Control */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <SpeakerSimpleHigh className="w-4 h-4" />
                    Volume Level
                  </Label>
                  <div className="flex items-center gap-4">
                    <SpeakerX className="w-4 h-4 text-muted-foreground" />
                    <Slider
                      value={[currentSettings.soundVolume]}
                      onValueChange={([value]) => 
                        setSettings({ ...currentSettings, soundVolume: value })
                      }
                      min={0}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <SpeakerHigh className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-mono w-12">
                      {currentSettings.soundVolume}%
                    </span>
                  </div>
                </div>

                <Separator />

                {/* Sound Selection for Each Type */}
                <div className="grid gap-4">
                  {[
                    { type: 'success', icon: Check, color: 'text-success', label: 'Success Notifications' },
                    { type: 'warning', icon: Warning, color: 'text-warning', label: 'Warning Notifications' },
                    { type: 'error', icon: X, color: 'text-destructive', label: 'Error Notifications' },
                    { type: 'info', icon: Info, color: 'text-primary', label: 'Info Notifications' }
                  ].map(({ type, icon: Icon, color, label }) => (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${color}`} />
                        <Label className="text-sm">{label}</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={currentSettings[`${type}Sound` as keyof NotificationSettings] as string}
                          onValueChange={(value) => 
                            setSettings({ ...currentSettings, [`${type}Sound`]: value })
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {soundOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => playTestSound(currentSettings[`${type}Sound` as keyof NotificationSettings] as string)}
                          disabled={testingSound === currentSettings[`${type}Sound` as keyof NotificationSettings]}
                        >
                          <TestTube className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Notification Types */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Types</CardTitle>
            <CardDescription>
              Choose which types of notifications to receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { type: 'success', icon: Check, color: 'text-success', label: 'Success Messages', description: 'PO processing completed, syncs successful' },
              { type: 'warning', icon: Warning, color: 'text-warning', label: 'Warning Messages', description: 'Low confidence detections, manual review needed' },
              { type: 'error', icon: X, color: 'text-destructive', label: 'Error Messages', description: 'Processing failures, connection issues' },
              { type: 'info', icon: Info, color: 'text-primary', label: 'Information Messages', description: 'Sync schedules, system status updates' }
            ].map(({ type, icon: Icon, color, label, description }) => (
              <div key={type} className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 ${color} mt-0.5`} />
                  <div>
                    <Label className="text-base font-medium">{label}</Label>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendTestNotification(type as 'success' | 'warning' | 'error' | 'info')}
                  >
                    Test
                  </Button>
                  <Switch
                    checked={currentSettings.types[type as keyof typeof currentSettings.types]}
                    onCheckedChange={(checked) => 
                      setSettings({ 
                        ...currentSettings, 
                        types: { ...currentSettings.types, [type]: checked }
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Do Not Disturb */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Do Not Disturb
            </CardTitle>
            <CardDescription>
              Automatically silence notifications during specific hours
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Enable Do Not Disturb</Label>
                <p className="text-sm text-muted-foreground">
                  Silence notifications during set hours
                </p>
              </div>
              <Switch
                checked={currentSettings.doNotDisturbEnabled}
                onCheckedChange={(checked) => 
                  setSettings({ ...currentSettings, doNotDisturbEnabled: checked })
                }
              />
            </div>

            {currentSettings.doNotDisturbEnabled && (
              <div className="ml-6 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Start Time</Label>
                  <input
                    type="time"
                    value={currentSettings.doNotDisturbStart}
                    onChange={(e) => 
                      setSettings({ ...currentSettings, doNotDisturbStart: e.target.value })
                    }
                    className="w-full p-2 border border-input rounded-md text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">End Time</Label>
                  <input
                    type="time"
                    value={currentSettings.doNotDisturbEnd}
                    onChange={(e) => 
                      setSettings({ ...currentSettings, doNotDisturbEnd: e.target.value })
                    }
                    className="w-full p-2 border border-input rounded-md text-sm"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
