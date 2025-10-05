import { ComponentProps, forwardRef } from "react"
import { Slot } from "@radix-ui/react-slot"
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right"
import MoreHorizontal from "lucide-react/dist/esm/icons/more-horizontal"

import { cn } from "@/lib/utils"

const Breadcrumb = forwardRef<HTMLElement, ComponentProps<"nav">>(
  ({ ...props }, ref) => {
    return <nav aria-label="breadcrumb" data-slot="breadcrumb" ref={ref} {...props} />
  }
)

Breadcrumb.displayName = "Breadcrumb"

const BreadcrumbList = forwardRef<HTMLOListElement, ComponentProps<"ol">>(
  ({ className, ...props }, ref) => {
    return (
      <ol
        ref={ref}
        data-slot="breadcrumb-list"
        className={cn(
          "text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5",
          className
        )}
        {...props}
      />
    )
  }
)
BreadcrumbList.displayName = "BreadcrumbList"

const BreadcrumbItem = forwardRef<HTMLLIElement, ComponentProps<"li">>(
  ({ className, ...props }, ref) => {
    return (
      <li
        ref={ref}
        data-slot="breadcrumb-item"
        className={cn("inline-flex items-center gap-1.5", className)}
        {...props}
      />
    )
  }
)
BreadcrumbItem.displayName = "BreadcrumbItem"

const BreadcrumbLink = forwardRef<
  HTMLAnchorElement,
  ComponentProps<"a"> & {
    asChild?: boolean
  }
>(({ asChild, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "a"

  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn("hover:text-foreground transition-colors", className)}
      ref={ref}
      {...props}
    />
  )
})

BreadcrumbLink.displayName = "BreadcrumbLink"

const BreadcrumbPage = forwardRef<HTMLSpanElement, ComponentProps<"span">>(
  ({ className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        data-slot="breadcrumb-page"
        role="link"
        aria-disabled="true"
        aria-current="page"
        className={cn("text-foreground font-normal", className)}
        {...props}
      />
    )
  }
)
BreadcrumbPage.displayName = "BreadcrumbPage"

const BreadcrumbSeparator = forwardRef<
  HTMLLIElement,
  ComponentProps<"li">
>(({ children, className, ...props }, ref) => {
  return (
    <li
      ref={ref}
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  )
})
BreadcrumbSeparator.displayName = "BreadcrumbSeparator"

const BreadcrumbEllipsis = forwardRef<
  HTMLSpanElement,
  ComponentProps<"span">
>(({ className, ...props }, ref) => {
  return (
    <span
      ref={ref}
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More</span>
    </span>
  )
})
BreadcrumbEllipsis.displayName = "BreadcrumbEllipsis"

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
