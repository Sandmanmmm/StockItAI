import { ComponentProps, forwardRef } from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover-lift",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-modern hover:from-primary/90 hover:to-primary/70 hover:shadow-modern-lg active:scale-95 backdrop-blur",
        destructive:
          "bg-gradient-to-br from-destructive to-destructive/80 text-white shadow-modern hover:from-destructive/90 hover:to-destructive/70 hover:shadow-modern-lg focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 active:scale-95",
        outline:
          "border-enhanced glass shadow-modern hover:bg-accent hover:text-accent-foreground dark:hover:bg-input/50 hover:border-ring/70 hover:shadow-modern-lg active:scale-95",
        secondary:
          "bg-gradient-to-br from-secondary to-secondary/80 text-secondary-foreground shadow-modern hover:from-secondary/90 hover:to-secondary/70 hover:shadow-modern-lg active:scale-95",
        ghost:
          "hover:glass hover:text-accent-foreground hover:shadow-modern dark:hover:bg-accent/50 active:scale-95",
        link: "text-primary underline-offset-4 hover:underline active:scale-95",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})

Button.displayName = "Button"

export { Button, buttonVariants }
