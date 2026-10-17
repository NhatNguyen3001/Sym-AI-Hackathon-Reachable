import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Sizes follow the UI spec: touch targets >= 44px, primary buttons 56px, radius 12-14px.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] border font-bold text-center leading-tight transition-colors select-none disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-white hover:bg-primary-hover hover:border-primary-hover",
        secondary: "border-line-strong bg-surface text-ink hover:bg-bg",
        outline: "border-line-strong bg-surface text-ink hover:bg-bg",
        ghost: "border-transparent bg-transparent text-ink hover:bg-bg",
        link: "border-transparent bg-transparent text-primary underline underline-offset-4 hover:text-primary-hover px-0",
      },
      size: {
        default: "min-h-12 px-5 py-2 text-[16px]",
        sm: "min-h-11 px-4 py-1.5 text-[15px]",
        lg: "min-h-14 px-6 py-3 text-[17px]",
        icon: "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
