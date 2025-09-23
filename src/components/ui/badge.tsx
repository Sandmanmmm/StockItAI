import { ComponentProps } from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-all duration-300 overflow-hidden shadow-modern backdrop-blur",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-modern hover-lift [a&]:hover:from-primary/90 [a&]:hover:to-primary/70 [a&]:hover:shadow-modern-lg",
        secondary:
          "border-transparent bg-gradient-to-br from-secondary to-secondary/80 text-secondary-foreground shadow-modern hover-lift [a&]:hover:from-secondary/90 [a&]:hover:to-secondary/70 [a&]:hover:shadow-modern-lg",
        destructive:
          "border-transparent bg-gradient-to-br from-destructive to-destructive/80 text-white shadow-modern hover-lift [a&]:hover:from-destructive/90 [a&]:hover:to-destructive/70 [a&]:hover:shadow-modern-lg focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "text-foreground border-border/50 glass shadow-modern hover-lift [a&]:hover:glass [a&]:hover:text-accent-foreground [a&]:hover:shadow-modern-lg [a&]:hover:border-border",
        success:
          "border-transparent bg-gradient-to-br from-green-500 to-green-600 text-white shadow-modern hover-lift [a&]:hover:from-green-400 [a&]:hover:to-green-500 [a&]:hover:shadow-modern-lg",
        warning:
          "border-transparent bg-gradient-to-br from-yellow-500 to-yellow-600 text-white shadow-modern hover-lift [a&]:hover:from-yellow-400 [a&]:hover:to-yellow-500 [a&]:hover:shadow-modern-lg",
        info:
          "border-transparent bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-modern hover-lift [a&]:hover:from-blue-400 [a&]:hover:to-blue-500 [a&]:hover:shadow-modern-lg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
