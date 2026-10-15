// The library-neutral Timeline contract shared by Galaxy Brain, Generous and
// Dim-0, and the one place Dim-0 normalizes Timeline props. Galaxy's
// gb.surface.v1 contract (catalog.components.Timeline.propsSchema) is the source
// of truth for the shape: `$defs.timeline` takes `events` or a spreadsheet-style
// `table`; the legacy TimelineJS shape (`data.events` with `start_date` and
// `text.headline`) is still accepted for surfaces saved before it existed.
//
// These rules mirror Generous's lib/a2ui/timeline-contract.ts exactly (ids,
// precision, plain text, bounds, table date cells, legacy mapping), so both apps
// convert the same input identically — keep them in step. Pure; never throws.


export const TIMELINE_PRECISIONS = [
  "billion-years",
  "million-years",
  "millennium",
  "century",
  "decade",
  "year",
  "month",
  "day",
] as const
export type TimelinePrecision = (typeof TIMELINE_PRECISIONS)[number]

/** "#RRGGBB" or a theme palette token; never raw CSS. */
export const TIMELINE_COLOR_PATTERN = /^(#[0-9a-fA-F]{6}|chart-[1-5]|primary|secondary|muted|accent|destructive)$/
export const TIMELINE_CARD_STYLES = ["classic", "rounded", "note", "image", "dark"] as const
export type TimelineCardStyle = (typeof TIMELINE_CARD_STYLES)[number]
export const TIMELINE_FONTS = ["sans", "serif", "script", "mono", "display"] as const
export type TimelineFont = (typeof TIMELINE_FONTS)[number]

export interface TimelineDateV2 {
  /** Signed year: -500 is 500 BCE, -66000000 is 66 million years ago. */
  year: number
  month?: number
  day?: number
  /** Always set on normalized output. */
  precision?: TimelinePrecision
}

export interface TimelineMediaV2 {
  url: string
  caption?: string
  credit?: string
  alt?: string
}

export interface TimelineLinkV2 {
  url: string
  label?: string
}

export interface TimelineEventStyleV2 {
  card?: TimelineCardStyle
  color?: string
  font?: TimelineFont
}

export interface TimelineEventV2 {
  id: string
  title: string
  subtitle?: string
  description?: string
  start: TimelineDateV2
  end?: TimelineDateV2
  dateLabel?: string
  importance?: number
  category?: string
  group?: string
  tags?: string[]
  media?: TimelineMediaV2
  link?: TimelineLinkV2
  style?: TimelineEventStyleV2
}

export interface TimelineEraV2 {
  title: string
  start: TimelineDateV2
  end: TimelineDateV2
  category?: string
  color?: string
}

/** The normalized shape: always events, never a table. */
export interface TimelineV2 {
  title?: string
  height?: number
  events: TimelineEventV2[]
  eras?: TimelineEraV2[]
}

/** The contract's bounds. */
export const TIMELINE_LIMITS = {
  title: 500,
  minHeight: 160,
  maxHeight: 1600,
  events: 500,
  eras: 50,
  id: 128,
  eventTitle: 300,
  subtitle: 300,
  description: 10000,
  dateLabel: 200,
  category: 120,
  group: 120,
  tags: 20,
  tag: 60,
  url: 2000,
  caption: 2000,
  credit: 1000,
  alt: 1000,
  linkLabel: 200,
  eraTitle: 200,
  minYear: -14_000_000_000,
  maxYear: 100_000,
} as const

/** Importance an event without one counts as. */
export const DEFAULT_IMPORTANCE = 3


// --- Plain text and URLs ----------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", deg: "°", minus: "−",
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const codePoint = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

/**
 * Reduce TimelineJS's HTML text to plain text, keeping paragraph and line breaks
 * as newlines. Only legacy text goes through this: the current shape is plain
 * text already, and "1 < 2" there is meant literally.
 */
export function toPlainText(html: unknown): string {
  if (typeof html !== "string" || !html) return ""
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
  return decodeEntities(text)
    .split("\n")
    .map((part) => part.replace(/[ \t\f\v\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}

/** Only http(s) URLs are linked or loaded; `javascript:` and friends parse as valid URLs too. */
export function safeHttpUrl(url: unknown): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined
    return parsed.href.length <= TIMELINE_LIMITS.url ? parsed.href : undefined
  } catch {
    return undefined
  }
}

/** Cut to at most `max` code points (as the contract counts them). */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const points = Array.from(text)
  return points.length <= max ? text : points.slice(0, max).join("")
}

/** A single line of plain text, or undefined when empty. */
function line(value: unknown, max: number): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) value = String(value)
  if (typeof value !== "string") return undefined
  const text = value.replace(/\s+/g, " ").trim()
  return text ? clip(text, max) : undefined
}

/** Multi-line plain text, or undefined when empty. */
function paragraph(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const text = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((part) => part.replace(/[ \t\f\v\u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text ? clip(text, max) : undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

const oneOf = <T extends string>(options: readonly T[], value: unknown): T | undefined =>
  typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : undefined

export function isTimelineColor(value: unknown): value is string {
  return typeof value === "string" && TIMELINE_COLOR_PATTERN.test(value)
}


// --- Dates ------------------------------------------------------------------

/** The precision a date has from its parts: day, month, million-years for deep time, else year. */
export function inferPrecision(date: { year: number; month?: number; day?: number }): TimelinePrecision {
  if (date.day !== undefined) return "day"
  if (date.month !== undefined) return "month"
  if (Math.abs(date.year) >= 1e6) return "million-years"
  return "year"
}

const isIntegerIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max

/**
 * A date within the contract, or null without a usable year. A month or day out
 * of range is dropped rather than failing the date; a day is only kept with its month.
 */
function toDate(raw: unknown, precision?: unknown): TimelineDateV2 | null {
  if (!isRecord(raw)) return null
  const { year } = raw
  if (!isIntegerIn(year, TIMELINE_LIMITS.minYear, TIMELINE_LIMITS.maxYear)) return null
  const date: TimelineDateV2 = { year }
  if (isIntegerIn(raw.month, 1, 12)) {
    date.month = raw.month
    if (isIntegerIn(raw.day, 1, 31)) date.day = raw.day
  }
  date.precision = oneOf(TIMELINE_PRECISIONS, precision) ?? inferPrecision(date)
  return date
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const trimNumber = (value: number) => String(Number(value.toFixed(2)))

function ordinal(value: number): string {
  const tens = value % 100
  if (tens >= 11 && tens <= 13) return `${value}th`
  return `${value}${["th", "st", "nd", "rd"][value % 10] ?? "th"}`
}

/** A date at its precision: "20 Jul 1969", "500 BCE", "1960s", "20th century", "66 million years ago". */
export function formatTimelineDate(date: TimelineDateV2): string {
  const { year } = date
  const magnitude = Math.abs(year)
  const precision = date.precision ?? inferPrecision(date)
  const era = year < 0 ? " BCE" : ""
  if (precision === "billion-years" || (year < 0 && magnitude >= 1e9)) return `${trimNumber(magnitude / 1e9)} billion years ago`
  if (precision === "million-years" || (year < 0 && magnitude >= 1e6)) return `${trimNumber(magnitude / 1e6)} million years ago`
  // The 20th century is 1901–2000; the 5th century BCE is 500–401 BCE.
  if (precision === "millennium") return `${ordinal(Math.max(1, Math.floor((magnitude - 1) / 1000) + 1))} millennium${era}`
  if (precision === "century") return `${ordinal(Math.max(1, Math.floor((magnitude - 1) / 100) + 1))} century${era}`
  if (precision === "decade") return `${Math.floor(magnitude / 10) * 10}s${era}`
  const yearText = year < 0 ? `${magnitude} BCE` : String(year)
  if (precision === "year" || !date.month) return yearText
  const monthText = MONTHS[date.month - 1]
  if (precision === "month" || !date.day) return `${monthText} ${yearText}`
  return `${date.day} ${monthText} ${yearText}`
}

/** The label an event shows: its dateLabel, or its start (and end) at their precision. */
export function formatEventDate(event: Pick<TimelineEventV2, "start" | "end" | "dateLabel">): string {
  if (event.dateLabel) return event.dateLabel
  const start = formatTimelineDate(event.start)
  if (!event.end) return start
  const end = formatTimelineDate(event.end)
  return end === start ? start : `${start} – ${end}`
}


// --- Normalization ----------------------------------------------------------

/** Event ids must be unique; a repeated one gets its index appended. */
function claimId(candidate: string, index: number, seen: Set<string>): string {
  let id = candidate
  for (let attempt = 1; seen.has(id); attempt += 1) {
    const suffix = attempt === 1 ? `-${index}` : `-${index}-${attempt}`
    id = clip(candidate, TIMELINE_LIMITS.id - suffix.length) + suffix
  }
  seen.add(id)
  return id
}

function toMedia(raw: unknown): TimelineMediaV2 | undefined {
  if (!isRecord(raw)) return undefined
  const url = safeHttpUrl(raw.url)
  if (!url) return undefined
  const media: TimelineMediaV2 = { url }
  const caption = line(raw.caption, TIMELINE_LIMITS.caption)
  const credit = line(raw.credit, TIMELINE_LIMITS.credit)
  const alt = line(raw.alt, TIMELINE_LIMITS.alt)
  if (caption) media.caption = caption
  if (credit) media.credit = credit
  if (alt) media.alt = alt
  return media
}

function toLink(raw: unknown): TimelineLinkV2 | undefined {
  if (!isRecord(raw)) return undefined
  const url = safeHttpUrl(raw.url)
  if (!url) return undefined
  const label = line(raw.label, TIMELINE_LIMITS.linkLabel)
  return label ? { url, label } : { url }
}

function toTags(raw: unknown): string[] | undefined {
  const values = typeof raw === "string" ? raw.split(",") : Array.isArray(raw) ? raw : []
  const tags: string[] = []
  for (const value of values) {
    const tag = line(value, TIMELINE_LIMITS.tag)
    if (tag && !tags.includes(tag)) tags.push(tag)
    if (tags.length === TIMELINE_LIMITS.tags) break
  }
  return tags.length > 0 ? tags : undefined
}

function toStyle(raw: unknown): TimelineEventStyleV2 | undefined {
  if (!isRecord(raw)) return undefined
  const style: TimelineEventStyleV2 = {}
  const card = oneOf(TIMELINE_CARD_STYLES, raw.card)
  const font = oneOf(TIMELINE_FONTS, raw.font)
  if (card) style.card = card
  if (isTimelineColor(raw.color)) style.color = raw.color
  if (font) style.font = font
  return Object.keys(style).length > 0 ? style : undefined
}

function toImportance(raw: unknown): number | undefined {
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.min(5, Math.max(1, Math.round(value)))
}

interface OptionalFields {
  subtitle?: unknown
  description?: unknown
  end?: TimelineDateV2 | null
  dateLabel?: unknown
  importance?: unknown
  category?: unknown
  group?: unknown
  tags?: unknown
  media?: TimelineMediaV2
  link?: TimelineLinkV2
  style?: TimelineEventStyleV2
}

/** Optional event fields shared by the current shape, the legacy shape and the table. */
function withOptionalFields(event: TimelineEventV2, fields: OptionalFields): TimelineEventV2 {
  const subtitle = line(fields.subtitle, TIMELINE_LIMITS.subtitle)
  const description = paragraph(fields.description, TIMELINE_LIMITS.description)
  const dateLabel = line(fields.dateLabel, TIMELINE_LIMITS.dateLabel)
  const importance = toImportance(fields.importance)
  const category = line(fields.category, TIMELINE_LIMITS.category)
  const group = line(fields.group, TIMELINE_LIMITS.group)
  const tags = toTags(fields.tags)
  if (subtitle) event.subtitle = subtitle
  if (description) event.description = description
  if (fields.end) event.end = fields.end
  if (dateLabel) event.dateLabel = dateLabel
  if (importance !== undefined) event.importance = importance
  if (category) event.category = category
  if (group) event.group = group
  if (tags) event.tags = tags
  if (fields.media) event.media = fields.media
  if (fields.link) event.link = fields.link
  if (fields.style) event.style = fields.style
  return event
}

function toEvents(raw: unknown[]): TimelineEventV2[] {
  const seen = new Set<string>()
  const events: TimelineEventV2[] = []
  raw.forEach((item, index) => {
    if (!isRecord(item) || events.length === TIMELINE_LIMITS.events) return
    const start = toDate(item.start, isRecord(item.start) ? item.start.precision : undefined)
    if (!start) return
    const title = line(item.title, TIMELINE_LIMITS.eventTitle) ?? "Untitled"
    const id = claimId(line(item.id, TIMELINE_LIMITS.id) ?? `event-${index}`, index, seen)
    events.push(
      withOptionalFields(
        { id, title, start },
        {
          ...item,
          end: toDate(item.end, isRecord(item.end) ? item.end.precision : undefined),
          media: toMedia(item.media),
          link: toLink(item.link),
          style: toStyle(item.style),
        },
      ),
    )
  })
  return events
}

function toEras(raw: unknown): TimelineEraV2[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const eras: TimelineEraV2[] = []
  for (const item of raw) {
    if (!isRecord(item) || eras.length === TIMELINE_LIMITS.eras) continue
    const start = toDate(item.start, isRecord(item.start) ? item.start.precision : undefined)
    const end = toDate(item.end, isRecord(item.end) ? item.end.precision : undefined)
    if (!start || !end) continue
    const era: TimelineEraV2 = { title: line(item.title, TIMELINE_LIMITS.eraTitle) ?? "Untitled", start, end }
    const category = line(item.category, TIMELINE_LIMITS.category)
    if (category) era.category = category
    if (isTimelineColor(item.color)) era.color = item.color
    eras.push(era)
  }
  return eras.length > 0 ? eras : undefined
}

function toHeight(raw: unknown): number | undefined {
  const value = typeof raw === "string" && /^\s*\d+(\.\d+)?\s*(px)?\s*$/i.test(raw) ? parseFloat(raw) : raw
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.min(TIMELINE_LIMITS.maxHeight, Math.max(TIMELINE_LIMITS.minHeight, Math.round(value)))
}


// --- Legacy (TimelineJS) ----------------------------------------------------

function fromLegacy(data: Record<string, unknown>, options: unknown): TimelineV2 {
  const seen = new Set<string>()
  const events: TimelineEventV2[] = []
  const slides = Array.isArray(data.events) ? data.events : []
  slides.forEach((slide, index) => {
    if (!isRecord(slide) || events.length === TIMELINE_LIMITS.events) return
    const start = toDate(slide.start_date)
    if (!start) return
    const text = isRecord(slide.text) ? slide.text : {}
    const startDate = isRecord(slide.start_date) ? slide.start_date : {}
    const uniqueId = typeof slide.unique_id === "string" ? line(slide.unique_id, TIMELINE_LIMITS.id) : undefined
    const event: TimelineEventV2 = {
      id: claimId(uniqueId ?? `event-${index}`, index, seen),
      title: line(toPlainText(text.headline), TIMELINE_LIMITS.eventTitle) ?? "Untitled",
      start,
    }
    events.push(
      withOptionalFields(event, {
        description: toPlainText(text.text),
        end: toDate(slide.end_date),
        dateLabel: line(toPlainText(slide.display_date), TIMELINE_LIMITS.dateLabel) ?? toPlainText(startDate.display_date),
        group: slide.group,
        // TimelineJS captions and credits may be HTML too.
        media: isRecord(slide.media)
          ? toMedia({ url: slide.media.url, caption: toPlainText(slide.media.caption), credit: toPlainText(slide.media.credit), alt: slide.media.alt })
          : undefined,
      }),
    )
  })

  const eras: TimelineEraV2[] = []
  for (const era of Array.isArray(data.eras) ? data.eras : []) {
    if (!isRecord(era) || eras.length === TIMELINE_LIMITS.eras) continue
    const start = toDate(era.start_date)
    const end = toDate(era.end_date)
    if (!start || !end) continue
    const text = isRecord(era.text) ? era.text : {}
    eras.push({ title: line(toPlainText(text.headline), TIMELINE_LIMITS.eraTitle) ?? "Untitled", start, end })
  }

  const timeline: TimelineV2 = { events }
  const titleSlide = isRecord(data.title) ? data.title : {}
  const title = line(toPlainText(isRecord(titleSlide.text) ? titleSlide.text.headline : undefined), TIMELINE_LIMITS.title)
  const height = toHeight(isRecord(options) ? options.height : undefined)
  if (title) timeline.title = title
  if (height !== undefined) timeline.height = height
  if (eras.length > 0) timeline.eras = eras
  return timeline
}


// --- Table (spreadsheet) input ----------------------------------------------

const BCE_SUFFIX = /^(\d[\d,]*)\s*(?:BCE|BC|B\.C\.E\.|B\.C\.)$/i
const CE_SUFFIX = /^(\d[\d,]*)\s*(?:CE|AD|C\.E\.|A\.D\.)$/i
const CE_PREFIX = /^(?:AD|A\.D\.)\s*(\d[\d,]*)$/i
const CALENDAR = /^([+-]?\d{1,11})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?(?:[T ]\d{1,2}:\d{2}.*)?$/
const YEARS_AGO = /^(\d+(?:\.\d+)?)\s*(thousand|million|billion)\s+years?\s+ago$/i
const CIRCA = /^(?:circa\s+|ca\.\s*|c\.\s*|c\s+)(.+)$/i
const SCALE = { thousand: 1e3, million: 1e6, billion: 1e9 } as const

const parseWhole = (digits: string) => Number(digits.replace(/,/g, ""))

/** A date from parts, or null when they are out of the contract's range. */
function partsToDate(year: number, month?: number, day?: number): TimelineDateV2 | null {
  if (!isIntegerIn(year, TIMELINE_LIMITS.minYear, TIMELINE_LIMITS.maxYear)) return null
  if (month !== undefined && !isIntegerIn(month, 1, 12)) return null
  if (day !== undefined && !isIntegerIn(day, 1, 31)) return null
  const date: TimelineDateV2 = { year }
  if (month !== undefined) date.month = month
  if (month !== undefined && day !== undefined) date.day = day
  date.precision = inferPrecision(date)
  return date
}

export interface ParsedDateCell {
  date: TimelineDateV2
  /** The cell's own text, kept when it says more than the date does ("c. 1500"). */
  label?: string
}

/**
 * Parse a spreadsheet date cell: a number is a year; a string may be "YYYY",
 * "YYYY-MM", "YYYY-MM-DD" or "YYYY/MM/DD" (a trailing time is ignored), a
 * negative year ("-500"), "500 BCE"/"500 BC", "AD 500"/"500 CE", "66 million
 * years ago", or any of these after "c."/"circa", which keeps the cell as the label.
 */
export function parseTimelineDateCell(cell: unknown): ParsedDateCell | null {
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return null
    const date = partsToDate(Math.floor(cell))
    return date ? { date } : null
  }
  if (typeof cell !== "string") return null
  const text = cell.replace(/\s+/g, " ").trim()
  if (!text) return null

  const circa = CIRCA.exec(text)
  if (circa) {
    const parsed = parseTimelineDateCell(circa[1])
    return parsed ? { date: parsed.date, label: clip(text, TIMELINE_LIMITS.dateLabel) } : null
  }
  let match = BCE_SUFFIX.exec(text)
  if (match) {
    const date = partsToDate(-parseWhole(match[1]))
    return date ? { date } : null
  }
  match = CE_SUFFIX.exec(text) ?? CE_PREFIX.exec(text)
  if (match) {
    const date = partsToDate(parseWhole(match[1]))
    return date ? { date } : null
  }
  match = YEARS_AGO.exec(text)
  if (match) {
    const scale = SCALE[match[2].toLowerCase() as keyof typeof SCALE]
    const date = partsToDate(-Math.round(Number(match[1]) * scale))
    return date ? { date } : null
  }
  match = CALENDAR.exec(text)
  if (match) {
    const date = partsToDate(Number(match[1]), match[2] === undefined ? undefined : Number(match[2]), match[3] === undefined ? undefined : Number(match[3]))
    return date ? { date } : null
  }
  return null
}

const TABLE_FIELDS = [
  "id", "title", "subtitle", "description", "start", "end", "dateLabel", "importance", "category",
  "group", "tags", "image", "imageCaption", "imageCredit", "link", "linkLabel", "color",
] as const
type TableField = (typeof TABLE_FIELDS)[number]

function fromTable(table: Record<string, unknown>): TimelineEventV2[] {
  const columns: unknown[] = Array.isArray(table.columns) ? table.columns : []
  const rows: unknown[] = Array.isArray(table.rows) ? table.rows : []
  const map = isRecord(table.map) ? table.map : {}
  const columnOf = (field: TableField) => (typeof map[field] === "string" ? columns.indexOf(map[field]) : -1)
  const index = Object.fromEntries(TABLE_FIELDS.map((field) => [field, columnOf(field)])) as Record<TableField, number>
  if (index.title < 0 || index.start < 0) return []

  const seen = new Set<string>()
  const events: TimelineEventV2[] = []
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || events.length === TIMELINE_LIMITS.events) return
    const cell = (field: TableField): unknown => (index[field] >= 0 ? row[index[field]] : undefined)
    const title = line(cell("title"), TIMELINE_LIMITS.eventTitle)
    const start = parseTimelineDateCell(cell("start"))
    if (!title || !start) return

    const id = claimId(line(cell("id"), TIMELINE_LIMITS.id) ?? `row-${rowIndex}`, rowIndex, seen)
    const imageUrl = safeHttpUrl(cell("image"))
    const media = imageUrl ? toMedia({ url: imageUrl, caption: cell("imageCaption"), credit: cell("imageCredit") }) : undefined
    const linkUrl = safeHttpUrl(cell("link"))
    const color = cell("color")
    const description = cell("description")
    events.push(
      withOptionalFields(
        { id, title, start: start.date },
        {
          subtitle: cell("subtitle"),
          description: typeof description === "number" ? String(description) : description,
          end: parseTimelineDateCell(cell("end"))?.date ?? null,
          dateLabel: line(cell("dateLabel"), TIMELINE_LIMITS.dateLabel) ?? start.label,
          importance: cell("importance"),
          category: cell("category"),
          group: cell("group"),
          tags: typeof cell("tags") === "string" ? cell("tags") : undefined,
          media,
          link: linkUrl ? toLink({ url: linkUrl, label: cell("linkLabel") }) : undefined,
          style: isTimelineColor(color) ? { color } : undefined,
        },
      ),
    )
  })
  return events
}


// --- Entry point ------------------------------------------------------------

/** Whether props are in the legacy TimelineJS shape (`data.events`). */
export function isLegacyTimelineProps(props: unknown): boolean {
  return isRecord(props) && isRecord(props.data) && Array.isArray(props.data.events)
}

/**
 * Normalize Timeline props in any accepted shape (current with `events`, current
 * with `table`, or legacy TimelineJS) to the current shape with events. Anything
 * unusable is dropped, never thrown: events without a start year, non-http(s)
 * URLs, colours that are not hex or theme tokens. `events` wins over `table`.
 */
export function normalizeTimelineProps(props: unknown): TimelineV2 {
  if (!isRecord(props)) return { events: [] }
  if (isLegacyTimelineProps(props)) return fromLegacy(props.data as Record<string, unknown>, props.options)
  const events = Array.isArray(props.events) ? toEvents(props.events) : isRecord(props.table) ? fromTable(props.table) : []
  const timeline: TimelineV2 = { events }
  const title = line(props.title, TIMELINE_LIMITS.title)
  const height = toHeight(props.height)
  const eras = toEras(props.eras)
  if (title) timeline.title = title
  if (height !== undefined) timeline.height = height
  if (eras) timeline.eras = eras
  return timeline
}
