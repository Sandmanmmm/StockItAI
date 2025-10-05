import { ComponentProps, forwardRef } from "react"
import { cn } from "@/lib/utils"

const Table = forwardRef<HTMLTableElement, ComponentProps<"table">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        data-slot="table-container"
        className="relative w-full overflow-x-auto"
      >
        <table
          ref={ref}
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    )
  }
)
Table.displayName = "Table"

const TableHeader = forwardRef<HTMLTableSectionElement, ComponentProps<"thead">>(
  ({ className, ...props }, ref) => {
    return (
      <thead
        ref={ref}
        data-slot="table-header"
        className={cn("[&_tr]:border-b", className)}
        {...props}
      />
    )
  }
)
TableHeader.displayName = "TableHeader"

const TableBody = forwardRef<HTMLTableSectionElement, ComponentProps<"tbody">>(
  ({ className, ...props }, ref) => {
    return (
      <tbody
        ref={ref}
        data-slot="table-body"
        className={cn("[&_tr:last-child]:border-0", className)}
        {...props}
      />
    )
  }
)
TableBody.displayName = "TableBody"

const TableFooter = forwardRef<HTMLTableSectionElement, ComponentProps<"tfoot">>(
  ({ className, ...props }, ref) => {
    return (
      <tfoot
        ref={ref}
        data-slot="table-footer"
        className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
        {...props}
      />
    )
  }
)
TableFooter.displayName = "TableFooter"

const TableRow = forwardRef<HTMLTableRowElement, ComponentProps<"tr">>(
  ({ className, ...props }, ref) => {
    return (
      <tr
        ref={ref}
        data-slot="table-row"
        className={cn(
          "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
          className
        )}
        {...props}
      />
    )
  }
)
TableRow.displayName = "TableRow"

const TableHead = forwardRef<HTMLTableCellElement, ComponentProps<"th">>(
  ({ className, ...props }, ref) => {
    return (
      <th
        ref={ref}
        data-slot="table-head"
        className={cn(
          "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
          className
        )}
        {...props}
      />
    )
  }
)
TableHead.displayName = "TableHead"

const TableCell = forwardRef<HTMLTableCellElement, ComponentProps<"td">>(
  ({ className, ...props }, ref) => {
    return (
      <td
        ref={ref}
        data-slot="table-cell"
        className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
        {...props}
      />
    )
  }
)
TableCell.displayName = "TableCell"

const TableCaption = forwardRef<HTMLTableCaptionElement, ComponentProps<"caption">>(
  ({ className, ...props }, ref) => {
    return (
      <caption
        ref={ref}
        data-slot="table-caption"
        className={cn("text-muted-foreground mt-4 text-sm", className)}
        {...props}
      />
    )
  }
)
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
