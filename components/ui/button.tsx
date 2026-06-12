import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium",
    "ring-offset-background transition-all duration-250",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-40",
    "active:scale-[0.97]",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-foreground text-background shadow-sm",
          "hover:bg-foreground/85",
        ].join(" "),
        destructive: [
          "bg-destructive text-destructive-foreground shadow-sm",
          "hover:bg-destructive/90",
        ].join(" "),
        outline: [
          "border border-border bg-background",
          "hover:bg-accent hover:text-accent-foreground",
        ].join(" "),
        secondary: [
          "bg-secondary text-secondary-foreground",
          "hover:bg-secondary/80",
        ].join(" "),
        ghost: [
          "hover:bg-accent hover:text-accent-foreground",
        ].join(" "),
        link: "text-foreground underline-offset-4 hover:underline",
        soft: [
          "bg-accent text-foreground",
          "hover:bg-accent/80",
        ].join(" "),
        "soft-destructive": [
          "bg-destructive/10 text-destructive",
          "hover:bg-destructive/15",
        ].join(" "),
        "soft-success": [
          "bg-success/10 text-success",
          "hover:bg-success/15",
        ].join(" "),
        success: [
          "bg-success text-success-foreground shadow-sm",
          "hover:bg-success/90",
        ].join(" "),
      },
      size: {
        default: "h-10 px-5 py-2",
        xs: "h-7 rounded-full px-3 text-xs",
        sm: "h-9 rounded-full px-4",
        lg: "h-12 rounded-full px-7 text-base",
        xl: "h-14 rounded-full px-8 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-full",
        "icon-xs": "h-6 w-6 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
