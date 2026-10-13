// The applet <Stats> component. Adapted from Generous's StatsDisplay (MIT): KPI
// tiles with an optional change badge and sparkline.

import { cn } from "@/lib/utils"

import type { Stat, StatsProps } from "./types"


const COLUMN_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
}


/** A tiny inline SVG trend line (no axes) scaled to its min/max. */
function Sparkline({ points }: { points: number[] }) {
  const values = points.filter((p) => typeof p === "number" && Number.isFinite(p))
  if (values.length < 2) return null
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26}`)
    .join(" ")
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-1 h-6 w-full text-chart-1" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}


/** One KPI tile. */
function StatTile({ stat }: { stat: Stat }) {
  const change = typeof stat.change === "number" && Number.isFinite(stat.change) ? stat.change : undefined
  const good = change === undefined || change === 0 ? undefined : (change > 0) === (stat.goodDirection !== "down")
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{stat.label}</div>
      <div className="text-2xl font-semibold tabular-nums">{String(stat.value ?? "")}</div>
      {change !== undefined && (
        <div className={cn("text-xs tabular-nums", good === undefined ? "text-muted-foreground" : good ? "text-chart-2" : "text-destructive")}>
          {change > 0 ? "▲" : change < 0 ? "▼" : "•"} {Math.abs(change)}%{stat.changeLabel ? ` ${stat.changeLabel}` : ""}
        </div>
      )}
      {Array.isArray(stat.sparkline) && <Sparkline points={stat.sparkline} />}
    </div>
  )
}


/** Render a grid of KPI tiles. */
export function Stats({ stats, columns = 3 }: StatsProps) {
  const list = Array.isArray(stats) ? stats.filter((s) => s && typeof s === "object") : []
  return (
    <div className={cn("grid gap-2", COLUMN_CLASS[columns] ?? COLUMN_CLASS[3])}>
      {list.map((s, i) => (
        <StatTile key={`${s.label}-${i}`} stat={s} />
      ))}
    </div>
  )
}
