// The applet <ProgressTracker> and <Timeline> components. Adapted from Generous
// (MIT): vertical step and event lists.

import { cn } from "@/lib/utils"

import type { ProgressStep, ProgressTrackerProps, TimelineProps } from "./types"


const STATUS_DOT: Record<NonNullable<ProgressStep["status"]>, string> = {
  done: "bg-chart-2 text-background",
  active: "bg-primary text-primary-foreground ring-4 ring-primary/20",
  pending: "bg-muted text-muted-foreground",
  error: "bg-destructive text-background",
}

const STATUS_GLYPH: Record<NonNullable<ProgressStep["status"]>, string> = {
  done: "✓",
  active: "•",
  pending: "",
  error: "!",
}


/** Render steps with done / active / pending / error states. */
export function ProgressTracker({ steps }: ProgressTrackerProps) {
  const list = Array.isArray(steps) ? steps.filter((s) => s && typeof s === "object") : []
  return (
    <ol className="space-y-3">
      {list.map((step, i) => {
        const status = step.status && step.status in STATUS_DOT ? step.status : "pending"
        return (
          <li key={`${step.label}-${i}`} className="flex gap-3">
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", STATUS_DOT[status])}>
              {STATUS_GLYPH[status] || i + 1}
            </span>
            <div className="min-w-0">
              <div className={cn("text-sm font-medium", status === "pending" && "text-muted-foreground")}>{step.label}</div>
              {step.description && <div className="text-xs text-muted-foreground">{step.description}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}


/** Render dated events along a vertical rail, in the given order. */
export function Timeline({ events }: TimelineProps) {
  const list = Array.isArray(events) ? events.filter((e) => e && typeof e === "object") : []
  return (
    <ol className="relative ml-2 border-l border-border">
      {list.map((event, i) => (
        <li key={`${event.date}-${i}`} className="mb-4 ml-4 last:mb-0">
          <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border border-background bg-primary" />
          <time className="text-xs text-muted-foreground">{event.date}</time>
          <div className="text-sm font-medium">{event.title}</div>
          {event.description && <div className="text-xs text-muted-foreground">{event.description}</div>}
        </li>
      ))}
    </ol>
  )
}
