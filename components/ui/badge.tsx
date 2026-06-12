import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-200",
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background hover:bg-foreground/85",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/75",
        destructive:
          "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/15",
        outline:
          "border border-border text-foreground bg-transparent hover:bg-accent",
        success:
          "bg-success/10 text-success border border-success/20 hover:bg-success/15",
        warning:
          "bg-warning/10 text-warning border border-warning/20 hover:bg-warning/15",
        info:
          "bg-info/10 text-info border border-info/20 hover:bg-info/15",
        muted:
          "bg-muted text-muted-foreground hover:bg-muted/75",
        "solid-success": "bg-success text-success-foreground",
        "solid-warning": "bg-warning text-warning-foreground",
        "solid-info": "bg-info text-info-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
