// The <Timeline> view model. Props come from agent-authored applet source, Galaxy
// Brain surfaces or a pasted sheet, so they first go through the shared contract
// normalizer (contract.ts — identical rules to Generous): bounds, plain text,
// http(s) URLs, palette/hex colours, unique ids, stated precision. This module
// then fills the view's defaults and orders events by date. Pure.

import { categoryColors } from "./colors"
import {
  DEFAULT_IMPORTANCE,
  TIMELINE_LIMITS,
  isLegacyTimelineProps,
  normalizeTimelineProps,
  type TimelineCardStyle,
  type TimelineDateV2,
  type TimelineEventV2,
  type TimelineFont,
  type TimelinePrecision,
} from "./contract"
import { dateValue } from "./dates"

export { formatEventDate, formatTimelineDate, normalizeTimelineProps, safeHttpUrl, toPlainText } from "./contract"


export const MAX_EVENTS = TIMELINE_LIMITS.events
export const MAX_ERAS = TIMELINE_LIMITS.eras
export const DEFAULT_HEIGHT = 440

export type CardStyle = TimelineCardStyle
export type CardFont = TimelineFont

/** A normalized date: precision is always stated. */
export interface TimelineDate extends TimelineDateV2 {
  precision: TimelinePrecision
}

export interface TimelineEvent extends Omit<TimelineEventV2, "start" | "end" | "tags" | "style"> {
  start: TimelineDate
  end?: TimelineDate
  tags: string[]
  style: NonNullable<TimelineEventV2["style"]>
}

export interface TimelineEra {
  title: string
  start: TimelineDate
  end: TimelineDate
  category?: string
  color?: string
}

export interface TimelineModel {
  title?: string
  height: number
  /** Chronological (stable for equal dates). */
  events: TimelineEvent[]
  eras: TimelineEra[]
  /** Category → colour (palette token or hex), in order of first appearance. */
  colors: Map<string, string>
  /** Inputs that were dropped, for logs / translator warnings. */
  notes: string[]
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}


/** Importance an event counts as (missing = 3). */
export function importanceOf(event: Pick<TimelineEvent, "importance">): number {
  return event.importance ?? DEFAULT_IMPORTANCE
}


/** How many input items there were, for the "dropped" note. */
function inputCount(p: Record<string, unknown>): { kind: string; count: number } {
  if (isLegacyTimelineProps(p)) return { kind: "event", count: (p.data as { events: unknown[] }).events.length }
  if (Array.isArray(p.events)) return { kind: "event", count: p.events.length }
  if (isRecord(p.table) && Array.isArray(p.table.rows)) return { kind: "table row", count: p.table.rows.length }
  return { kind: "event", count: 0 }
}


/** Normalize `<Timeline>` props (any accepted shape) into the view model. */
export function normalizeTimeline(props: unknown): TimelineModel {
  const p = isRecord(props) ? props : {}
  const timeline = normalizeTimelineProps(p)
  const notes: string[] = []
  const { kind, count } = inputCount(p)
  const dropped = count - timeline.events.length
  if (dropped > 0) notes.push(`${dropped} ${kind}(s) without a usable title or start date (or over the ${MAX_EVENTS} limit) were dropped`)
  if (Array.isArray(p.events) && p.table !== undefined) notes.push("both events and table were given; the events were used")

  const events = timeline.events
    .map((e, order): { event: TimelineEvent; order: number } => ({
      event: { ...e, start: e.start as TimelineDate, end: e.end as TimelineDate | undefined, tags: e.tags ?? [], style: e.style ?? {} },
      order,
    }))
    .sort((a, b) => dateValue(a.event.start) - dateValue(b.event.start) || a.order - b.order)
    .map(({ event }) => event)
  const eras = (timeline.eras ?? []).map((era): TimelineEra => ({ ...era, start: era.start as TimelineDate, end: era.end as TimelineDate }))
  // Colours follow first appearance in the data as given (events, then eras), not date order.
  const colors = categoryColors([...timeline.events.map((e) => e.category), ...eras.map((e) => e.category)])
  const model: TimelineModel = { height: timeline.height ?? DEFAULT_HEIGHT, events, eras, colors, notes }
  if (timeline.title) model.title = timeline.title
  return model
}


/** The colour of an event: its style colour, else its category's, else the theme primary. */
export function eventColor(event: TimelineEvent, colors: Map<string, string>): string {
  return event.style.color ?? (event.category ? colors.get(event.category) : undefined) ?? "primary"
}


/** The colour of an era: its own, else its category's; undefined = neutral shading. */
export function eraColor(era: TimelineEra, colors: Map<string, string>): string | undefined {
  return era.color ?? (era.category ? colors.get(era.category) : undefined)
}
