// The timeline's time scale: a view is a window of fractional years (`start`,
// `span`) drawn across the stage width. Pan / zoom / fit are pure transforms of a
// view, and ticks adapt from days up to billions of years. Pure.

import {
  MONTH_NAMES,
  calendarOfDay,
  dayIndexValue,
  formatYear,
  groupDigits,
  monthIndexValue,
  trimNumber,
} from "./dates"


export interface View {
  /** Fractional year at the left edge. */
  start: number
  /** Years across the stage. */
  span: number
}

export interface ViewLimits {
  minSpan: number
  maxSpan: number
  /** Data extent (fractional years); the view may not lose it entirely. */
  min: number
  max: number
}

export interface Tick {
  value: number
  label: string
  major: boolean
}

/** Three days: the closest zoom. */
export const MIN_SPAN = 3 / 365
/** Twice the age of the universe: the widest zoom. */
export const MAX_SPAN = 3e10


export function xOf(value: number, view: View, width: number): number {
  return ((value - view.start) / view.span) * width
}


export function valueAt(x: number, view: View, width: number): number {
  return view.start + (x / width) * view.span
}


/** Zoom limits for data spanning `min`..`max`. */
export function limitsFor(min: number, max: number): ViewLimits {
  const range = Math.max(0, max - min)
  const magnitude = Math.max(Math.abs(min), Math.abs(max))
  const maxSpan = Math.min(MAX_SPAN, Math.max(range * 4, magnitude * 0.5, 200))
  return { minSpan: MIN_SPAN, maxSpan, min, max }
}


/** Clamp span to the limits and keep some of the data on screen. */
export function clampView(view: View, limits: ViewLimits): View {
  const span = Math.min(limits.maxSpan, Math.max(limits.minSpan, Number.isFinite(view.span) ? view.span : limits.maxSpan))
  const lo = limits.min - span * 0.9
  const hi = limits.max - span * 0.1
  const start = Number.isFinite(view.start) ? Math.min(Math.max(view.start, lo), Math.max(lo, hi)) : limits.min
  return { start, span }
}


/** Zoom by `factor` (< 1 zooms in) keeping the time under `anchorX` fixed. */
export function zoomAt(view: View, factor: number, anchorX: number, width: number, limits: ViewLimits): View {
  if (!(width > 0) || !Number.isFinite(factor) || factor <= 0) return view
  const anchor = valueAt(anchorX, view, width)
  const span = Math.min(limits.maxSpan, Math.max(limits.minSpan, view.span * factor))
  return clampView({ start: anchor - (anchorX / width) * span, span }, limits)
}


/** Pan by `dx` screen pixels (positive drags the content right, i.e. back in time). */
export function panBy(view: View, dx: number, width: number, limits: ViewLimits): View {
  if (!(width > 0)) return view
  return clampView({ start: view.start - (dx / width) * view.span, span: view.span }, limits)
}


/** A view showing `min`..`max`, padded — more on the right, where cards hang. */
export function fitView(min: number, max: number, limits: ViewLimits): View {
  const range = max - min
  if (!(range > 0)) {
    const span = Math.max(Math.abs(min) * 0.2, 20)
    return clampView({ start: min - span * 0.3, span }, limits)
  }
  return clampView({ start: min - range * 0.06, span: range * 1.3 }, limits)
}


/** Centre `value` at fraction `at` of the width (for keyboard navigation). */
export function centerOn(view: View, value: number, limits: ViewLimits, at = 0.35): View {
  return clampView({ start: value - view.span * at, span: view.span }, limits)
}


type Unit = { kind: "day"; n: number } | { kind: "month"; n: number } | { kind: "year"; n: number }

const DAY_STEPS = [1, 2, 7, 14]
const MONTH_STEPS = [1, 3, 6]
const YEAR_STEPS: number[] = []
for (let p = 0; p <= 10; p++) for (const m of [1, 2, 5]) YEAR_STEPS.push(m * 10 ** p)

const UNITS: Unit[] = [
  ...DAY_STEPS.map((n): Unit => ({ kind: "day", n })),
  ...MONTH_STEPS.map((n): Unit => ({ kind: "month", n })),
  ...YEAR_STEPS.map((n): Unit => ({ kind: "year", n })),
]


function unitYears(unit: Unit): number {
  return unit.kind === "day" ? unit.n / 365 : unit.kind === "month" ? unit.n / 12 : unit.n
}


/** A tick label for a year tick at step `step`: deep time reads "… million years ago". */
export function formatTickYear(year: number, step: number): string {
  const abs = Math.abs(year)
  if (year < 0 && abs >= 1e9) return `${trimNumber(abs / 1e9)} billion years ago`
  if (year < 0 && abs >= 1e6) return `${trimNumber(abs / 1e6)} million years ago`
  if (year < 0 && step >= 1e5) return `${trimNumber(abs / 1e6)} million years ago`
  if (year >= 1e6) return `${trimNumber(year / 1e6)} million`
  return formatYear(year)
}


function dayLabel(dayIndex: number): { label: string; major: boolean } {
  const { year, month, day } = calendarOfDay(dayIndex)
  if (day === 1) return { label: month === 1 ? formatYear(year) : `${MONTH_NAMES[month - 1]} ${formatYear(year)}`, major: true }
  return { label: `${day} ${MONTH_NAMES[month - 1]}`, major: false }
}


function monthLabel(monthIndex: number): { label: string; major: boolean } {
  const year = Math.floor(monthIndex / 12)
  const month = monthIndex - year * 12
  return month === 0 ? { label: formatYear(year), major: true } : { label: `${MONTH_NAMES[month]} ${formatYear(year)}`, major: false }
}


/** Rough label width in px (11px UI font) plus breathing room. */
function labelRoom(label: string): number {
  return label.length * 6.4 + 28
}


function sampleLabel(unit: Unit, view: View): string {
  const mid = view.start + view.span / 2
  if (unit.kind === "day") return "28 Sep"
  if (unit.kind === "month") return `Sep ${formatYear(Math.floor(mid))}`
  const year = Math.round(mid / unit.n) * unit.n
  // The widest of the neighbours (deep-time and BCE labels vary in length).
  return [year - unit.n, year, year + unit.n].map((y) => formatTickYear(y, unit.n)).sort((a, b) => b.length - a.length)[0]
}


/** Pick the finest unit whose labels fit the pixels a step gets. */
export function tickUnit(view: View, width: number): Unit {
  const ppy = width / view.span
  for (const unit of UNITS) {
    if (unitYears(unit) * ppy >= labelRoom(sampleLabel(unit, view))) return unit
  }
  return UNITS[UNITS.length - 1]
}


const MAX_TICKS = 400


/** Ticks covering the view (with a step of margin on each side). */
export function ticks(view: View, width: number): Tick[] {
  if (!(width > 0) || !(view.span > 0)) return []
  const unit = tickUnit(view, width)
  const end = view.start + view.span
  const out: Tick[] = []
  if (unit.kind === "day") {
    const first = Math.floor((view.start * 365) / unit.n) * unit.n
    for (let i = first; out.length < MAX_TICKS; i += unit.n) {
      const value = dayIndexValue(i)
      if (value > end + unit.n / 365) break
      out.push({ value, ...dayLabel(i) })
    }
    return out
  }
  if (unit.kind === "month") {
    const first = Math.floor((Math.floor(view.start) * 12) / unit.n) * unit.n - unit.n
    for (let i = first; out.length < MAX_TICKS; i += unit.n) {
      const value = monthIndexValue(i)
      if (value > end + unit.n / 12) break
      if (value < view.start - unit.n / 12) continue
      out.push({ value, ...monthLabel(i) })
    }
    return out
  }
  const step = unit.n
  const firstK = Math.floor(view.start / step) - 1
  const lastK = Math.ceil(end / step) + 1
  for (let k = firstK; k <= lastK && out.length < MAX_TICKS; k++) {
    const value = k * step
    out.push({ value, label: formatTickYear(value, step), major: k % 5 === 0 })
  }
  return out
}


/** A compact label for the visible span ("≈ 3 days", "120 years", "4.5 billion years"). */
export function spanLabel(span: number): string {
  if (span < 1 / 12) return `${Math.max(1, Math.round(span * 365))} days`
  if (span < 2) return `${Math.max(1, Math.round(span * 12))} months`
  if (span >= 1e9) return `${trimNumber(span / 1e9)} billion years`
  if (span >= 1e6) return `${trimNumber(span / 1e6)} million years`
  return `${groupDigits(Math.round(span))} years`
}
