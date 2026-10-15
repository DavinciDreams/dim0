// Axis-side date helpers: a linear "fractional year" for placing a date on the
// axis, calendar indexing for day / month ticks, and year formatting for tick
// labels. Card and detail dates use the shared contract formatter
// (contract.ts `formatTimelineDate`). Pure.
//
// Years are signed as in the contract (-500 = 500 BCE). The axis value ignores
// leap days — a 365-day year keeps the mapping linear; it is never shown.


const MONTH_DAYS_BEFORE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


/** The date as a fractional year, for placing it on the axis. */
export function dateValue(date: { year: number; month?: number; day?: number }): number {
  if (date.month === undefined) return date.year
  const dayOfYear = MONTH_DAYS_BEFORE[date.month - 1] + Math.min(31, date.day ?? 1) - 1
  return date.year + dayOfYear / 365
}


/** Calendar parts for a whole-day index (`round(value * 365)`). */
export function calendarOfDay(dayIndex: number): { year: number; month: number; day: number } {
  const year = Math.floor(dayIndex / 365)
  const dayOfYear = dayIndex - year * 365
  let month = 11
  while (month > 0 && MONTH_DAYS_BEFORE[month] > dayOfYear) month--
  return { year, month: month + 1, day: dayOfYear - MONTH_DAYS_BEFORE[month] + 1 }
}


/** Day index → fractional year. */
export function dayIndexValue(dayIndex: number): number {
  return dayIndex / 365
}


/** Month index (`year * 12 + month - 1`) → fractional year at the month's first day. */
export function monthIndexValue(monthIndex: number): number {
  const year = Math.floor(monthIndex / 12)
  return year + MONTH_DAYS_BEFORE[monthIndex - year * 12] / 365
}


/** A number with at most two decimals and no trailing zeros ("13.8", "65"). */
export function trimNumber(value: number): string {
  return String(Number(value.toFixed(2)))
}


/** Thousands separators for large magnitudes only ("12,000" but "1850"). */
export function groupDigits(value: number): string {
  const abs = Math.abs(value)
  const body = abs >= 10_000 ? abs.toLocaleString("en-US", { maximumFractionDigits: 0 }) : String(abs)
  return value < 0 ? `-${body}` : body
}


/** A tick year: "1850", "500 BCE", "12,000 BCE", "65 million years ago", "13.8 billion years ago". */
export function formatYear(year: number): string {
  const abs = Math.abs(year)
  if (year < 0 && abs >= 1e9) return `${trimNumber(abs / 1e9)} billion years ago`
  if (year < 0 && abs >= 1e6) return `${trimNumber(abs / 1e6)} million years ago`
  if (year < 0) return `${groupDigits(abs)} BCE`
  return groupDigits(year)
}
