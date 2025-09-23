import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  className?: string
  size?: "sm" | "md" | "lg"
}

export function LoadingSpinner({ className, size = "md" }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6", 
    lg: "w-8 h-8"
  }

  return (
    <div
      className={cn(
        "relative",
        sizeClasses[size],
        className
      )}
    >
      <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary spin-ease"></div>
      <div className="absolute inset-1 rounded-full bg-gradient-to-tr from-primary/30 to-transparent animate-pulse"></div>
    </div>
  )
}

interface LoadingDotsProps {
  className?: string
}

export function LoadingDots({ className }: LoadingDotsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-primary animate-pulse"
          style={{
            animationDelay: `${i * 0.2}s`,
            animationDuration: "1s"
          }}
        />
      ))}
    </div>
  )
}

interface LoadingBarProps {
  className?: string
  progress?: number
}

export function LoadingBar({ className, progress }: LoadingBarProps) {
  return (
    <div className={cn("w-full h-1 bg-muted rounded-full overflow-hidden", className)}>
      <div 
        className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 ease-out shimmer"
        style={{ 
          width: progress ? `${progress}%` : "100%",
          animation: progress ? undefined : "shimmer 1.5s ease-in-out infinite"
        }}
      />
    </div>
  )
}

interface SkeletonProps {
  className?: string
  lines?: number
}

export function Skeleton({ className, lines = 1 }: SkeletonProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "skeleton h-4 w-full",
            i === lines - 1 && lines > 1 && "w-3/4"
          )}
        />
      ))}
    </div>
  )
}

export function PulsingDot({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
      <div className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping opacity-75"></div>
    </div>
  )
}