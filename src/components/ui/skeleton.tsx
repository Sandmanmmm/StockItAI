import { cn } from "@/lib/utils"
import { ComponentProps, forwardRef } from "react"

const Skeleton = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="skeleton"
        className={cn("bg-accent animate-pulse rounded-md", className)}
        {...props}
      />
    )
  }
)
Skeleton.displayName = "Skeleton"

export { Skeleton }
