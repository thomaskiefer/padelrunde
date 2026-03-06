import * as React from "react"
import { cva } from "class-variance-authority"
import { Slot } from "radix-ui"
import type {VariantProps} from "class-variance-authority";

import { cn } from "~/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        brandRed: "bg-brand-red border-brand-red text-white",
        brandNavy: "bg-brand-navy/5 border-brand-navy/10 text-brand-navy",
        brandTeal: "bg-brand-teal border-brand-teal text-white",
        statusActive: "bg-brand-red border-brand-red text-white",
        statusSetup: "bg-gray-100 border-gray-200 text-gray-600",
        statusFinished: "bg-brand-teal border-brand-teal text-white",
        statusKnockout: "bg-brand-navy border-brand-navy text-white",
        muted: "bg-gray-50 border-gray-200 text-gray-500",
        medalGold: "bg-gold/20 text-gold ring-1 ring-gold/30",
        medalSilver: "bg-silver/20 text-silver ring-1 ring-silver/30",
        medalBronze: "bg-bronze/20 text-bronze ring-1 ring-bronze/30",
      },
      size: {
        default: "",
        xs: "px-2 py-0.5 text-[10px] tracking-widest font-bold uppercase",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
