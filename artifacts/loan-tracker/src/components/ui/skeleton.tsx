import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

const Skeleton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className="animate-pulse rounded-md bg-primary/10"
      {...props}
    />
  )
})
Skeleton.displayName = "Skeleton"

export { Skeleton }
