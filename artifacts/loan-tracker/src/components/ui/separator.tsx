import * as React from "react"

const Separator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }
>(({ className, orientation = "horizontal", ...props }, ref) => (
  <div
    ref={ref}
    className={
      orientation === "horizontal"
        ? "h-[1px] w-full bg-border"
        : "h-full w-[1px] bg-border"
    }
    {...props}
  />
))
Separator.displayName = "Separator"

export { Separator }
