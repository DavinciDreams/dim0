// The applet <Badge> and <Separator> components. Adapted from the Generous A2UI
// Badge / Separator adapters (github.com/DavinciDreams/Generous-Works, MIT), on
// dim0's own shadcn primitives. Props are guarded: anything off-enum falls back.

import { Badge as UiBadge } from "@/components/ui/badge"
import { Separator as UiSeparator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import type { BadgeProps, SeparatorProps } from "./types"


const BADGE_VARIANTS = new Set(["default", "secondary", "outline", "destructive"])


/** A compact status label: `<Badge variant?>text</Badge>` or `<Badge text="…" />`. */
export function Badge({ variant, text, children, className }: BadgeProps) {
  const v = typeof variant === "string" && BADGE_VARIANTS.has(variant) ? variant : "secondary"
  const body = children ?? (typeof text === "string" || typeof text === "number" ? String(text) : null)
  return (
    <UiBadge variant={v as NonNullable<BadgeProps["variant"]>} className={typeof className === "string" ? className : undefined}>
      {body}
    </UiBadge>
  )
}


/** A thin rule between blocks; `orientation="vertical"` inside a row. */
export function Separator({ orientation, decorative, className }: SeparatorProps) {
  const vertical = orientation === "vertical"
  return (
    <UiSeparator
      orientation={vertical ? "vertical" : "horizontal"}
      decorative={decorative !== false}
      className={cn(vertical && "min-h-4 self-stretch", typeof className === "string" && className)}
    />
  )
}
