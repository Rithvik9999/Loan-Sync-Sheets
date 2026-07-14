import * as React from "react"
import { Link as WouterLink, useLocation } from "wouter"
import { cn } from "@/lib/utils"

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, href, children, ...props }, ref) => {
    return (
      <WouterLink href={href} className={className} {...props}>
        {children}
      </WouterLink>
    )
  }
)
Link.displayName = "Link"

export { Link }
