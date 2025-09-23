import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Sun, Moon, Monitor } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark' | 'system'

interface ThemeSwitcherProps {
  className?: string
}

export function ThemeSwitcher({ className }: ThemeSwitcherProps) {
  const [theme, setTheme] = useState<Theme>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const storedTheme = localStorage.getItem('theme') as Theme
    if (storedTheme) {
      setTheme(storedTheme)
    }
  }, [])

  useEffect(() => {
    if (!mounted) return

    const root = window.document.documentElement
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.classList.remove('light', 'dark')
      root.classList.add(systemTheme)
    } else {
      root.classList.remove('light', 'dark')
      root.classList.add(theme)
    }
    
    localStorage.setItem('theme', theme)
  }, [theme, mounted])

  if (!mounted) return null

  const themes = [
    { name: 'light' as const, icon: Sun, label: 'Light' },
    { name: 'dark' as const, icon: Moon, label: 'Dark' },
    { name: 'system' as const, icon: Monitor, label: 'System' }
  ]

  return (
    <div className={cn("flex items-center gap-1 p-1 rounded-lg glass border border-border/50", className)}>
      {themes.map((t) => {
        const Icon = t.icon
        const isActive = theme === t.name
        
        return (
          <Button
            key={t.name}
            variant="ghost"
            size="sm"
            onClick={() => setTheme(t.name)}
            className={cn(
              "relative h-8 w-8 p-0 transition-all duration-300",
              isActive && "glass shadow-modern"
            )}
            title={`Switch to ${t.label} theme`}
          >
            <Icon className="h-4 w-4" />
            {isActive && (
              <motion.div
                layoutId="theme-indicator"
                className="absolute inset-0 rounded-md bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30"
                initial={false}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </Button>
        )
      })}
    </div>
  )
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as Theme
    if (storedTheme) {
      setTheme(storedTheme)
    }
  }, [])

  return { theme, setTheme }
}