// Prop adapters: gb.surface.v1 component props → Dim-0 applet component props.
// The data projections (chart points, timeline events, graph entities, table
// cells) are ported from Galaxy Brain's `lib/surface-render-data.js` so an imported
// surface reads the same as it does in Galaxy Brain; where Dim-0's components can
// express more of the contract than Galaxy Brain's renderer draws (chart kinds,
// badge variants, layout alignment), the contract's own props are honoured.
// Pure and DOM-free; inputs are already bounded JSON (surface-project.ts).

import { isLegacyTimelineProps, normalizeTimelineProps } from "@/features/applet/render/generous/timeline/contract"
import type { JsonValue } from "@/features/applet/tree"

import type { JsonObject } from "./surface-project"


// ---- loose readers (every field may be malformed) ----

export function record(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {}
}


export function list(value: unknown): JsonValue[] {
  return Array.isArray(value) ? value : []
}


/** A string/number as text, else `fallback`. */
export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback
}


function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}


/** First non-blank string among `fields` of `props`, trimmed (GB `surfaceDisplayText`). */
export function displayText(props: JsonObject, fields: string[], fallback = ""): string {
  for (const field of fields) {
    const candidate = props[field]
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
  }
  return fallback
}


/** Truncate to `max` code points with an ellipsis. */
function clip(value: string, max: number): string {
  const chars = Array.from(value)
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : value
}


// ---- Charts ----

type AppletChartKind = "bar" | "line" | "area" | "pie" | "doughnut" | "scatter" | "radar"

interface Point {
  x: string
  y: number
  label: string
}

interface Series {
  name: string
  points: Point[]
}

const STRUCTURAL_VARIANTS = new Set(["sankeyNodes", "chordNodes", "graphNodes", "vennSets", "vennIntersections"])

const VARIANT_FIELDS = [
  "data", "stages", "sankeyNodes", "sankeyLinks", "chordNodes", "chordLinks",
  "treeMapData", "graphNodes", "graphLinks", "words", "vennSets", "vennIntersections", "ranges",
]

/** Generous chart kinds Dim-0's <Chart> draws natively (or as the closest equivalent). */
const NATIVE_KIND: Record<string, AppletChartKind> = {
  line: "line",
  area: "area",
  bar: "bar",
  histogram: "bar",
  funnel: "bar",
  pie: "pie",
  scatter: "scatter",
  radar: "radar",
}

const MAX_SERIES = 32
const MAX_POINTS = 1000
const MAX_LABELS = 2000


/** One datum as a point (GB `chartPoint`): scalars, tuples, and records with a value-ish key. */
function chartPoint(candidate: JsonValue, index: number, variant: string, chartType: string): Point {
  const n = finite(candidate)
  if (n !== null) return { x: String(index + 1), y: n, label: "" }
  if (typeof candidate === "string") return { x: candidate, y: 1, label: "" }
  if (Array.isArray(candidate)) {
    const y = candidate.map(finite).find((value) => value !== null)
    return y === undefined || y === null
      ? { x: String(index + 1), y: 1, label: text(candidate[0]) }
      : { x: text(candidate[0], String(index + 1)), y, label: "" }
  }
  const item = record(candidate)
  const valueKeys =
    chartType === "candlestick"
      ? ["close", "value", "y", "high", "open", "low"]
      : chartType === "heatmap"
        ? ["value", "count", "weight", "y"]
        : ["y", "value", "count", "weight", "size", "frequency", "close", "max", "end"]
  const y = valueKeys.map((key) => finite(item[key])).find((value) => value !== null)
  const relation = typeof item.from === "string" && typeof item.to === "string" ? `${item.from} → ${item.to}` : ""
  const sets = Array.isArray(item.sets) ? item.sets.map((s) => text(s)).filter(Boolean).join(" ∩ ") : ""
  const x = text(
    item.x ?? item.label ?? item.name ?? item.text ?? item.word ?? item.id ?? item.key ?? item.stage ?? item.date,
    relation || sets || String(index + 1),
  )
  const label = text(item.label ?? item.name ?? item.text ?? item.word ?? item.id)
  const structural = STRUCTURAL_VARIANTS.has(variant) ? variant : ""
  return { x, y: y ?? 1, label: label === x ? "" : label || structural }
}


function hierarchyPoints(value: JsonValue, path: string[] = [], depth = 0): Point[] {
  if (depth > 12) return []
  const node = record(value)
  const label = text(node.label ?? node.name ?? node.id, `Level ${depth + 1}`)
  const children = list(node.children)
  if (children.length > 0) return children.flatMap((child) => hierarchyPoints(child, [...path, label], depth + 1))
  const point = chartPoint(node, 0, "hierarchy", "hierarchy")
  return [{ ...point, x: [...path, label].filter(Boolean).join(" / ") }]
}


/** GB `projectChartData`: every series-ish field of a Charts `data` as named point series. */
function projectSeries(data: JsonObject, chartType: string): Series[] {
  const series: Series[] = list(data.series).flatMap((candidate, i) => {
    const item = record(candidate)
    const points = list(item.data).map((p, j) => chartPoint(p, j, "series", chartType))
    return points.length ? [{ name: text(item.name, `Series ${i + 1}`), points }] : []
  })
  for (const field of VARIANT_FIELDS) {
    const values = list(data[field])
    if (values.length === 0) continue
    const points =
      field === "treeMapData" ? values.flatMap((v) => hierarchyPoints(v)) : values.map((v, j) => chartPoint(v, j, field, chartType))
    series.push({ name: field.replace(/([A-Z])/g, " $1").toLowerCase(), points })
  }
  const value = finite(data.value)
  if (value !== null) series.push({ name: text(data.title, chartType || "value"), points: [{ x: chartType || "value", y: value, label: "" }] })
  if (Object.hasOwn(data, "hierarchyData")) series.push({ name: "hierarchy data", points: hierarchyPoints(data.hierarchyData) })
  return series
}


export interface AppletChartConfig {
  title: string
  type: AppletChartKind
  data: { labels?: JsonValue[]; datasets: JsonObject[] }
  options: JsonObject
  height: number
  hasData: boolean
}


/** A px height from a contract `height` (number or "300"/"300px"), clamped; else `fallback`. */
export function pxHeight(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+(\.\d+)?(px)?$/.test(value) ? Number.parseFloat(value) : NaN
  return Number.isFinite(n) ? Math.min(1200, Math.max(80, Math.round(n))) : fallback
}


/** Adapt a Charts component to a Dim-0 `<Chart>` config; `note` explains any approximation. */
export function chartFromSurface(props: JsonObject, note: (message: string) => void): AppletChartConfig {
  const data = record(props.data)
  const options = record(props.options)
  const chartType = text(data.type)
  const series = projectSeries(data, chartType)
  if (series.length > MAX_SERIES) note(`chart shows the first ${MAX_SERIES} of ${series.length} series`)
  const shown = series.slice(0, MAX_SERIES).map((s) => ({ ...s, points: s.points.slice(0, MAX_POINTS) }))
  const title = text(data.title, shown[0]?.name || chartType || "Chart")
  const height = pxHeight(options.height, 260)
  const chartOptions: JsonObject = options.showLegend === false ? { plugins: { legend: { display: false } } } : {}
  const base = { title, options: chartOptions, height, hasData: shown.some((s) => s.points.length > 0) }

  const min = finite(data.min) ?? 0
  const max = finite(data.max)
  const value = finite(data.value)
  if (chartType === "gauge" && value !== null && max !== null && max > min) {
    const filled = Math.min(max, Math.max(min, value)) - min
    return {
      ...base,
      type: "doughnut",
      data: { labels: ["Value", "Remaining"], datasets: [{ label: title, data: [filled, max - min - filled] }] },
    }
  }

  let type: AppletChartKind = NATIVE_KIND[chartType] ?? (chartType === "gauge" ? "bar" : "line")
  if (chartType && !(chartType in NATIVE_KIND)) note(`chart type ${JSON.stringify(chartType)} is drawn as a ${type} chart of its data points`)
  if (!chartType && shown.length === 0) type = "line"

  if (type === "pie") {
    if (shown.length > 1) note("a pie chart shows only its first series")
    const points = shown[0]?.points ?? []
    return { ...base, type, data: { labels: points.map((p) => p.x), datasets: [{ label: shown[0]?.name ?? title, data: points.map((p) => p.y) }] } }
  }
  if (type === "scatter") {
    return {
      ...base,
      type,
      data: {
        datasets: shown.map((s) => ({
          label: s.name,
          data: s.points.map((p, i) => {
            const x = Number(p.x)
            return { x: Number.isFinite(x) ? x : i + 1, y: p.y }
          }),
        })),
      },
    }
  }

  // Cartesian / radar: one shared label axis (first-seen order), each series aligned to it.
  const labels: string[] = []
  const seen = new Set<string>()
  for (const s of shown) {
    for (const p of s.points) {
      if (!seen.has(p.x) && labels.length < MAX_LABELS) {
        seen.add(p.x)
        labels.push(p.x)
      }
    }
  }
  const datasets = shown.map((s) => {
    const byX = new Map<string, number>()
    for (const p of s.points) if (!byX.has(p.x)) byX.set(p.x, p.y)
    return { label: s.name, data: labels.map((x) => byX.get(x) ?? null) }
  })
  return { ...base, type, data: { labels, datasets } }
}


// ---- DataTable ----

export interface AppletTableConfig {
  title: string
  columns: JsonObject[]
  rows: JsonObject[]
  sortable: boolean
  striped: boolean
  compact: boolean
  bordered: boolean
  pageSize?: number
}

const ALIGNS = new Set(["left", "center", "right"])
/** Rows shown per page when the surface does not paginate (Galaxy Brain shows the first 100). */
const DEFAULT_PAGE = 100


/** Adapt a DataTable to `<Table>` props; rows are projected to the visible columns only. */
export function tableFromSurface(props: JsonObject): AppletTableConfig {
  const data = record(props.data)
  const options = record(props.options)
  const rawRows = list(data.rows).filter((r) => r !== null && typeof r === "object" && !Array.isArray(r)) as JsonObject[]
  const declared = list(data.columns).map(record)
  const columns: JsonObject[] = []
  const keys = new Set<string>()
  const source = declared.length > 0
    ? declared.slice(0, 64).map((c) => ({
        key: text(c.accessorKey ?? c.key ?? c.id),
        label: text(c.header ?? c.label ?? c.title ?? c.accessorKey ?? c.id),
        align: typeof c.align === "string" && ALIGNS.has(c.align) ? c.align : undefined,
        sortable: c.enableSorting === true,
      }))
    : Object.keys(rawRows[0] ?? {}).slice(0, 12).map((key) => ({ key, label: key, align: undefined, sortable: false }))
  let anySortable = false
  for (const c of source) {
    if (!c.key || keys.has(c.key)) continue
    keys.add(c.key)
    anySortable ||= c.sortable
    columns.push(c.align ? { key: c.key, label: c.label, align: c.align } : { key: c.key, label: c.label })
  }
  const rows = rawRows.map((row) => {
    const out: JsonObject = {}
    for (const key of keys) if (Object.hasOwn(row, key)) out[key] = row[key]
    return out
  })
  const requested = finite(options.pageSize)
  const pageSize =
    options.enablePagination === true
      ? requested !== null && Number.isInteger(requested) && requested >= 1 && requested <= 500 ? requested : 10
      : rows.length > DEFAULT_PAGE ? DEFAULT_PAGE : undefined
  return {
    title: text(data.title ?? props.title),
    columns,
    rows,
    sortable: options.enableSorting === true || anySortable,
    striped: options.striped === true,
    compact: options.compact === true,
    bordered: options.bordered === true,
    ...(pageSize !== undefined ? { pageSize } : {}),
  }
}


// ---- StatsDisplay ----

const LOCALE = "en-US" // fixed so a translation is deterministic across machines


/** Format a KPI value per its Generous `format` (number / currency / percent / text). */
export function formatStatValue(value: unknown, format: unknown): string {
  if (typeof value === "string") return value
  const n = finite(value)
  if (n === null) return "—"
  const f = record(format)
  const decimals = (fallback: number): number => {
    const d = finite(f.decimals)
    return d !== null && Number.isInteger(d) && d >= 0 && d <= 12 ? d : fallback
  }
  try {
    switch (f.kind) {
      case "number": {
        const d = decimals(0)
        return new Intl.NumberFormat(LOCALE, {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
          ...(f.compact === true ? { notation: "compact" as const } : {}),
        }).format(n)
      }
      case "currency": {
        const d = decimals(2)
        const currency = typeof f.currency === "string" && /^[A-Za-z]{3}$/.test(f.currency) ? f.currency.toUpperCase() : "USD"
        return new Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
      }
      case "percent":
        return `${(f.basis === "unit" ? n : n * 100).toFixed(decimals(2))}%`
      default:
        return String(n)
    }
  } catch {
    return String(n)
  }
}


export interface AppletStatsConfig {
  title: string
  description: string
  stats: JsonObject[]
}


/** Adapt a StatsDisplay to `<Stats>` tiles (diff → change, sparkline → number array). */
export function statsFromSurface(props: JsonObject): AppletStatsConfig {
  const stats = list(props.stats ?? record(props.data).stats).map(record).map((stat, i) => {
    const out: JsonObject = {
      label: text(stat.label ?? stat.title ?? stat.name, `Metric ${i + 1}`),
      value: formatStatValue(stat.value, stat.format),
    }
    const diff = record(stat.diff)
    const change = finite(diff.value)
    if (change !== null) {
      out.change = change
      const d = finite(diff.decimals)
      out.changeDecimals = d !== null && Number.isInteger(d) && d >= 0 && d <= 12 ? d : 1
      if (typeof diff.label === "string" && diff.label) out.changeLabel = diff.label
      if (diff.upIsPositive === false) out.goodDirection = "down"
    }
    const spark = list(record(stat.sparkline).data).filter((v): v is number => finite(v) !== null)
    if (spark.length >= 2) out.sparkline = spark
    return out
  })
  return { title: text(props.title), description: text(props.description), stats }
}


// ---- Timeline ----

export interface AppletTimelineConfig {
  title?: string
  height?: number
  events: JsonObject[]
  eras: JsonObject[]
}


/**
 * Adapt a Timeline in either contract shape to Dim-0 `<Timeline>` props through
 * the shared contract normalizer (the same rules Generous applies): the
 * library-neutral shape (`events` or `table`) is guarded and passed through,
 * the legacy TimelineJS shape (`data.events`) is mapped event by event — id =
 * `unique_id` ?? `event-<index>`, plain-text headline / text, precision inferred
 * from the date parts, `display_date` as the label, http(s) media only, group
 * kept, undated events dropped. Events keep their input order.
 */
export function timelineFromSurface(props: JsonObject, note: (message: string) => void): AppletTimelineConfig {
  const timeline = normalizeTimelineProps(props)
  const raw = isLegacyTimelineProps(props) ? list(record(props.data).events) : Array.isArray(props.events) ? props.events : list(record(props.table).rows)
  const dropped = raw.length - timeline.events.length
  if (dropped > 0) note(`${dropped} timeline event(s) without a usable title or start date were dropped`)
  if (Array.isArray(props.events) && props.table !== undefined) note("the timeline has both events and table; the events were used")
  const out: AppletTimelineConfig = {
    events: timeline.events as unknown as JsonObject[],
    eras: (timeline.eras ?? []) as unknown as JsonObject[],
  }
  if (timeline.title) out.title = timeline.title
  if (timeline.height !== undefined) out.height = timeline.height
  return out
}


// ---- KnowledgeGraph ----

export interface AppletGraphConfig {
  title: string
  nodes: JsonObject[]
  edges: JsonObject[]
  layout: "force" | "tree"
  entityCount: number
  relationshipCount: number
}

const CHALLENGE = /contradict|challenge|oppose/i
const RAMP = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]


/** Adapt a KnowledgeGraph to `<Graph>` nodes/edges (entity type → ramp color, contested links dashed). */
export function graphFromSurface(props: JsonObject, note: (message: string) => void): AppletGraphConfig {
  const data = record(props.data)
  const options = record(props.options)
  const showLabels = options.showLabels !== false
  const showTypes = options.showTypes !== false
  const rawEntities = list(data.entities).map(record)
  const rawRelationships = list(data.relationships).map(record)

  const ids = new Set<string>()
  const typeColor = new Map<string, string>()
  const nodes: JsonObject[] = []
  rawEntities.slice(0, 500).forEach((entity, i) => {
    const id = text(entity.id, String(i))
    if (ids.has(id)) {
      note(`knowledge graph entity ${JSON.stringify(id.slice(0, 64))} is duplicated; the later one was dropped`)
      return
    }
    ids.add(id)
    const type = text(entity.type)
    if (!typeColor.has(type)) typeColor.set(type, RAMP[typeColor.size % RAMP.length])
    const node: JsonObject = { id, label: showLabels ? clip(text(entity.label, `Entity ${i + 1}`), 24) : "", color: typeColor.get(type)! }
    if (showTypes && type) node.sublabel = type
    nodes.push(node)
  })

  const drawable = rawRelationships.filter((r) => ids.has(text(r.source)) && ids.has(text(r.target))).slice(0, 1000)
  if (drawable.length < rawRelationships.length) {
    note(`${rawRelationships.length - drawable.length} knowledge graph relationship(s) point at unknown entities and were dropped`)
  }
  // Galaxy Brain labels links only while the diagram is small enough to stay legible.
  const labelled = drawable.length <= 16
  const edges: JsonObject[] = []
  for (const r of drawable) {
    const a = text(r.source)
    const b = text(r.target)
    const kind = text(r.label || r.type, "related to")
    const edge: JsonObject = { a, b }
    if (labelled) edge.label = clip(kind, 18)
    if (CHALLENGE.test(kind)) edge.dashed = true
    edges.push(edge)
    if (r.bidirectional === true && a !== b) edges.push(edge.dashed ? { a: b, b: a, dashed: true } : { a: b, b: a })
  }
  return {
    title: text(props.title, "Knowledge graph"),
    nodes,
    edges,
    layout: options.layout === "hierarchical" ? "tree" : "force",
    entityCount: rawEntities.length,
    relationshipCount: rawRelationships.length,
  }
}
