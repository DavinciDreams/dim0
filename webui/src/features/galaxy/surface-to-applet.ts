// Translate a materialized Galaxy Brain surface (gb.surface.v1, catalog
// generous.a2ui v1) into Dim-0 applet source — the `<Widget>` JSX an applet note
// stores as its content. Pure: no DOM, no network, never throws.
//
// Mapping (see surface-adapters.ts for the prop adapters):
//   Title / Heading      → <h1>…<h6> (usageHint; default h2) with Galaxy Brain's heading type scale
//   Text                 → <p> for plain prose, <Markdown omitImages> when it has markdown syntax;
//                          a heading usageHint renders it as a heading instead
//   Badge                → <Badge variant>  (filled → default)
//   Separator            → <Separator orientation decorative>
//   Card                 → <Card> holding its children
//   Row / Column / Stack → flex <div> (distribution → justify-*, align → items-*)
//   Grid                 → grid <div> (columns → grid-cols-N, gap → gap-N)
//   DataTable            → <Table cellFormat="readable"> (+ title / sort / page / style options)
//   StatsDisplay         → <Stats> (format → formatted value, diff → change) under its title
//   Charts               → <Chart> ({ labels, datasets } built from Generous series / variants)
//   Timeline             → <Timeline events eras title? height?> — the contract shape is guarded
//                          and passed through (a `table` is converted to events); the legacy
//                          TimelineJS shape is mapped event by event (surface-adapters.ts)
//   KnowledgeGraph       → <Graph directed> (entities → nodes, relationships → edges)
//   Markdown             → <Markdown omitImages>
//   SVGPreview           → <SVGPreview> (sanitized inside the component)
//
// Escaping: no value from the surface is ever spliced into JSX as raw text or as
// a quoted attribute. Every string, number and object is emitted as a JSON literal
// inside an expression container (`{"…"}`), which is valid JS for any content —
// quotes, braces, `</`, `${`, JSX-looking text — and is parsed by the applet
// compiler as an inert literal. Only this module's own constant class names are
// written as plain attributes.
//
// Data placement: bulky props (table rows, chart datasets, graph nodes, stats,
// timeline events, long markdown, SVG source) go into the `<Widget data>` scope
// as `dN` entries and are bound by member access (`rows={d3.rows}`), keeping the
// markup readable and the data in one replaceable place. Applet notes hold only
// their source string, so `data` IS the applet's structured-data slot. The
// surface ref lives there too, under `gbSurface` (read it back with
// `readSurfaceRef`).

import { compileApplet } from "@/features/applet/compile"
import type { JsonValue } from "@/features/applet/tree"

import {
  chartFromSurface,
  displayText,
  graphFromSurface,
  record,
  statsFromSurface,
  tableFromSurface,
  text,
  timelineFromSurface,
} from "./surface-adapters"
import { projectSurfaceSpec, type JsonObject, type SurfaceNode } from "./surface-project"
import { SURFACE_IDENTIFIER, type SurfaceRef } from "./surface-types"


/** The `<Widget data>` key that records which surface revision an applet came from. */
export const SURFACE_REF_KEY = "gbSurface"


export interface SurfaceToAppletResult {
  /** Applet source; always compiles and passes `validateApplet`. */
  source: string
  /** Everything that was dropped, cut or approximated, for the import UI / logs. */
  warnings: string[]
}


const MAX_WARNINGS = 200
/** Strings longer than this move from inline props into the data scope. */
const INLINE_TEXT_LIMIT = 500
/** Text with any of this is rendered through Markdown; otherwise as a plain paragraph. */
const MARKDOWN_SYNTAX = /[*_`#[\]<>|~\\$!&]|https?:\/\/|www\.|^\s*([-+>]|\d+[.)])\s|\n\s*\n/m


// Class tables. Every class is spelled out literally so Tailwind's source scan
// generates it — applet markup is compiled at runtime and can't add new CSS.
const JUSTIFY: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  spaceBetween: "justify-between",
  spaceAround: "justify-around",
  spaceEvenly: "justify-evenly",
}
const ITEMS: Record<string, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
}
const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
  9: "grid-cols-9",
  10: "grid-cols-10",
  11: "grid-cols-11",
  12: "grid-cols-12",
}
const GAP: Record<string, string> = {
  "0": "gap-0",
  "1": "gap-1",
  "2": "gap-2",
  "3": "gap-3",
  "4": "gap-4",
  "5": "gap-5",
  "6": "gap-6",
  "8": "gap-8",
  "10": "gap-10",
  "12": "gap-12",
}
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])
const HEADING_LARGE = "text-2xl font-semibold tracking-tight"
const HEADING_SMALL = "text-lg font-semibold"
const SECTION = "gap-3 p-4"
const SECTION_TITLE = "text-base font-semibold"
const MUTED = "text-sm text-muted-foreground"
const BADGE_VARIANT: Record<string, string> = {
  filled: "default",
  outline: "outline",
  secondary: "secondary",
  destructive: "destructive",
}


const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)


/** A JSON value as a JS literal (U+2028/2029 escaped for older parsers). */
function lit(value: JsonValue): string {
  return JSON.stringify(value).split(LINE_SEPARATOR).join("\\u2028").split(PARAGRAPH_SEPARATOR).join("\\u2029")
}


/** ` name={<literal>}`, or "" when the value is undefined. */
function prop(name: string, value: JsonValue | undefined): string {
  return value === undefined ? "" : ` ${name}={${lit(value)}}`
}


/** Mutable translation state: the data scope and the warning list. */
class Emitter {
  readonly data: JsonObject = {}
  readonly warnings: string[]
  private next = 1

  constructor(warnings: string[]) {
    this.warnings = warnings
  }

  /** Record a warning (bounded). */
  warn(message: string): void {
    if (this.warnings.length < MAX_WARNINGS) this.warnings.push(message)
    else if (this.warnings.length === MAX_WARNINGS) this.warnings.push("… more warnings omitted")
  }

  /** Store `value` in the data scope and return its identifier. */
  bind(value: JsonValue): string {
    const key = `d${this.next++}`
    this.data[key] = value
    return key
  }

  /** A string attribute: inline when short, bound through the data scope when long. */
  textProp(name: string, value: string): string {
    if (value.length <= INLINE_TEXT_LIMIT) return prop(name, value)
    return ` ${name}={${this.bind(value)}}`
  }
}


/** An element as indented lines: self-closing when it has no children. */
function element(tag: string, attrs: string, children: string[], indent: string): string[] {
  if (children.length === 0) return [`${indent}<${tag}${attrs} />`]
  return [`${indent}<${tag}${attrs}>`, ...children, `${indent}</${tag}>`]
}


/** A one-line element whose only child is a literal text expression. */
function textElement(tag: string, className: string, value: string, indent: string): string[] {
  return [`${indent}<${tag} className="${className}">{${lit(value)}}</${tag}>`]
}


/** Join class fragments (all module constants). */
function classes(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ")
}


/** Emit one surface node (and its subtree) as JSX lines. */
function emitNode(node: SurfaceNode, out: Emitter, indent: string): string[] {
  const inner = indent + "  "
  const kids = (): string[] => node.children.flatMap((child) => emitNode(child, out, inner))
  const p = node.props
  switch (node.type) {
    case null:
      // Unknown or unsafe: not drawn, but its children keep their place.
      return node.children.flatMap((child) => emitNode(child, out, indent))
    case "Title":
    case "Heading":
      return emitHeading(displayText(p, ["text", "title", "content"], "Untitled"), text(p.usageHint), "h2", indent)
    case "Text":
      return emitText(p, out, indent)
    case "Badge": {
      const variant = BADGE_VARIANT[text(p.variant)] ?? "secondary"
      return [`${indent}<Badge variant="${variant}">{${lit(displayText(p, ["text", "label", "title"], "Badge"))}}</Badge>`]
    }
    case "Separator":
      return [
        `${indent}<Separator${p.orientation === "vertical" ? ' orientation="vertical"' : ""}${p.decorative === false ? " decorative={false}" : ""} />`,
      ]
    case "Card":
      return element("Card", ` className="gap-3 p-5"`, kids(), indent)
    case "Row":
      return element("div", ` className="${classes("flex flex-wrap gap-3", JUSTIFY[text(p.distribution)], ITEMS[text(p.align)] ?? "items-center")}"`, kids(), indent)
    case "Column":
    case "Stack":
      return element("div", ` className="${classes("flex flex-col gap-4", JUSTIFY[text(p.distribution)], ITEMS[text(p.align)])}"`, kids(), indent)
    case "Grid":
      return element("div", ` className="${classes("grid", GRID_COLS[gridColumns(p.columns, out, node.id)], GAP[text(p.gap)] ?? "gap-4")}"`, kids(), indent)
    case "DataTable":
      return withChildren(emitTable(p, out, indent), node, out, indent)
    case "StatsDisplay":
      return withChildren(emitStats(p, out, indent), node, out, indent)
    case "Charts":
      return withChildren(emitChart(p, out, indent), node, out, indent)
    case "Timeline":
      return withChildren(emitTimeline(p, out, indent), node, out, indent)
    case "KnowledgeGraph":
      return withChildren(emitGraph(p, out, indent), node, out, indent)
    case "Markdown":
      return withChildren(emitMarkdown(p, out, indent), node, out, indent)
    case "SVGPreview":
      return withChildren(emitSvg(p, out, indent), node, out, indent)
  }
}


/** Leaf components can't hold children; any listed ones follow them as siblings. */
function withChildren(lines: string[], node: SurfaceNode, out: Emitter, indent: string): string[] {
  if (node.children.length === 0) return lines
  out.warn(`${node.type} ${JSON.stringify(node.id)} cannot contain children; they are shown after it`)
  return [...lines, ...node.children.flatMap((child) => emitNode(child, out, indent))]
}


/** A heading at `usageHint` (h1–h6), or `fallback`, with Galaxy Brain's two-step type scale. */
function emitHeading(value: string, usageHint: string, fallback: string, indent: string): string[] {
  const tag = HEADING_TAGS.has(usageHint) ? usageHint : fallback
  return textElement(tag, tag === "h1" || tag === "h2" ? HEADING_LARGE : HEADING_SMALL, value, indent)
}


/** Text: a heading for heading hints, else prose (plain <p>, or Markdown when it has syntax). */
function emitText(p: JsonObject, out: Emitter, indent: string): string[] {
  const value = displayText(p, ["text", "title", "content"])
  const hint = text(p.usageHint)
  if (HEADING_TAGS.has(hint)) return emitHeading(value || "Untitled", hint, "h2", indent)
  if (!value) return []
  if (!MARKDOWN_SYNTAX.test(value)) return textElement("p", "text-sm leading-6", value, indent)
  return [`${indent}<div className="text-sm leading-6">`, `${indent}  <Markdown${out.textProp("content", value)} omitImages />`, `${indent}</div>`]
}


/** Grid `columns`: an integer 1–12, or a CSS track list / repeat() reduced to its track count. */
function gridColumns(value: unknown, out: Emitter, id: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12) return value
  if (typeof value === "string") {
    const repeat = /^\s*repeat\(\s*(\d+)\s*,/.exec(value)
    const count = repeat ? Number(repeat[1]) : value.trim().split(/\s+(?![^(]*\))/).filter(Boolean).length
    if (count >= 1 && count <= 12) {
      out.warn(`Grid ${JSON.stringify(id)} columns ${JSON.stringify(value.slice(0, 100))} is drawn as ${count} equal columns`)
      return count
    }
  }
  if (value !== undefined) out.warn(`Grid ${JSON.stringify(id)} has unusable columns; drawn with 2`)
  return 2
}


/** A titled section card: `<Card>` with an optional heading and a body. */
function section(title: string, body: string[], indent: string, extra: string[] = []): string[] {
  const head = title ? textElement("h3", SECTION_TITLE, title, indent + "  ") : []
  return element("Card", ` className="${SECTION}"`, [...head, ...extra, ...body], indent)
}


function emitTable(p: JsonObject, out: Emitter, indent: string): string[] {
  const t = tableFromSurface(p)
  if (t.columns.length === 0) out.warn("a DataTable has no usable columns")
  const key = out.bind({ columns: t.columns, rows: t.rows })
  const attrs =
    ` columns={${key}.columns} rows={${key}.rows} cellFormat="readable"` +
    (t.title ? out.textProp("title", t.title) : "") +
    (t.sortable ? " sortable" : "") +
    (t.striped ? " striped" : "") +
    (t.compact ? " compact" : "") +
    (t.bordered ? " bordered" : "") +
    prop("pageSize", t.pageSize) +
    prop("emptyText", "No rows in this snapshot.")
  return element("Card", ` className="${SECTION}"`, [`${indent}  <Table${attrs} />`], indent)
}


function emitStats(p: JsonObject, out: Emitter, indent: string): string[] {
  const s = statsFromSurface(p)
  const tiles = (at: string): string[] =>
    s.stats.length > 0
      ? [`${at}<Stats stats={${out.bind(s.stats)}} columns={${Math.min(4, s.stats.length)}} />`]
      : textElement("p", MUTED, "No statistics in this snapshot.", at)
  if (!s.title && !s.description) return tiles(indent)
  const inner = indent + "  "
  const head = [
    ...(s.title ? textElement("h3", SECTION_TITLE, s.title, inner) : []),
    ...(s.description ? textElement("p", MUTED, s.description, inner) : []),
  ]
  return element("div", ` className="flex flex-col gap-3"`, [...head, ...tiles(inner)], indent)
}


function emitChart(p: JsonObject, out: Emitter, indent: string): string[] {
  const c = chartFromSurface(p, (m) => out.warn(m))
  const inner = indent + "  "
  const body = c.hasData
    ? [`${inner}<Chart type="${c.type}" data={${out.bind(c.data)}}${Object.keys(c.options).length ? prop("options", c.options) : ""} height={${c.height}} />`]
    : textElement("p", MUTED, "No point series in this snapshot.", inner)
  return section(c.title, body, indent)
}


function emitGraph(p: JsonObject, out: Emitter, indent: string): string[] {
  const g = graphFromSurface(p, (m) => out.warn(m))
  const inner = indent + "  "
  const counts = `${g.entityCount} entities · ${g.relationshipCount} relationships`
  const head = [
    `${inner}<div className="flex items-center justify-between gap-3">`,
    ...textElement("h3", SECTION_TITLE, g.title, inner + "  "),
    ...textElement("span", "text-xs text-muted-foreground", counts, inner + "  "),
    `${inner}</div>`,
  ]
  if (g.nodes.length === 0) return element("Card", ` className="${SECTION}"`, [...head, ...textElement("p", MUTED, "No entities in this snapshot.", inner)], indent)
  const key = out.bind({ nodes: g.nodes, edges: g.edges })
  const graph = `${inner}<Graph nodes={${key}.nodes} edges={${key}.edges} layout="${g.layout}" directed height={360} />`
  return element("Card", ` className="${SECTION}"`, [...head, graph], indent)
}


/** `<Timeline>` with its events and eras bound from the data scope (eras always present, so an
 *  empty timeline still renders as the picture timeline, not the legacy list). */
function emitTimeline(p: JsonObject, out: Emitter, indent: string): string[] {
  const t = timelineFromSurface(p, (m) => out.warn(m))
  const key = out.bind({ events: t.events, eras: t.eras })
  const attrs = ` events={${key}.events} eras={${key}.eras}` + (t.title ? out.textProp("title", t.title) : "") + prop("height", t.height)
  return [`${indent}<Timeline${attrs} />`]
}


function emitMarkdown(p: JsonObject, out: Emitter, indent: string): string[] {
  const data = record(p.data)
  const content = text(data.content ?? data.markdown ?? p.content ?? p.markdown ?? p.text)
  const title = text(data.title)
  const markdown = (at: string): string => `${at}<Markdown content={${out.bind(content)}} omitImages />`
  if (!title) return [markdown(indent)]
  const inner = indent + "  "
  return element("div", ` className="flex flex-col gap-2"`, [...textElement("h3", SECTION_TITLE, title, inner), markdown(inner)], indent)
}


function emitSvg(p: JsonObject, out: Emitter, indent: string): string[] {
  const svg = text(p.svg)
  const title = text(p.title)
  const width = typeof p.width === "number" || typeof p.width === "string" ? p.width : undefined
  return [`${indent}<SVGPreview svg={${out.bind(svg)}}${title ? out.textProp("title", title) : ""}${prop("width", width)} />`]
}


/** Check an optional surface ref; returns it as JSON, or undefined (with a warning) when invalid. */
function refJson(ref: SurfaceRef | undefined, out: Emitter): JsonObject | undefined {
  if (ref === undefined) return undefined
  const r = record(ref)
  if (typeof r.surfaceId !== "string" || !SURFACE_IDENTIFIER.test(r.surfaceId)) {
    out.warn("the surface ref has an invalid surfaceId; it was not recorded")
    return undefined
  }
  if (typeof r.version !== "number" || !Number.isInteger(r.version) || r.version < 1) {
    out.warn("the surface ref has an invalid version; it was not recorded")
    return undefined
  }
  const json: JsonObject = { surfaceId: r.surfaceId, version: r.version }
  if (typeof r.title === "string" && r.title.trim()) json.title = r.title.trim().slice(0, 500)
  return json
}


/** Wrap a body in `<Widget>`, one data entry per line. */
function widget(data: JsonObject, body: string[]): string {
  const entries = Object.entries(data)
  const open = entries.length ? `<Widget data={{\n${entries.map(([k, v]) => `  ${lit(k)}: ${lit(v)}`).join(",\n")}\n}}>` : "<Widget>"
  return [open, ...body, "</Widget>"].join("\n") + "\n"
}


/**
 * Translate a materialized gb.surface.v1 spec into applet source. Unknown or
 * unsafe components are dropped (children kept), bounds are enforced, and every
 * problem is reported in `warnings`; a spec that is not a surface at all yields an
 * applet that says so. `ref` (surface id + version) is embedded for `readSurfaceRef`.
 */
export function surfaceToApplet(spec: unknown, ref?: SurfaceRef): SurfaceToAppletResult {
  const warnings: string[] = []
  const out = new Emitter(warnings)
  const refData = refJson(ref, out)
  if (refData) out.data[SURFACE_REF_KEY] = refData

  const projected = projectSurfaceSpec(spec, warnings)
  if (!projected.ok) {
    out.warn(projected.error)
    const notice = textElement("div", "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive", `This surface cannot be shown: ${projected.error}.`, "  ")
    return { source: widget(out.data, notice), warnings }
  }

  const body = projected.roots.flatMap((root) => emitNode(root, out, "    "))
  const content = body.length > 0 ? body : textElement("p", MUTED, "This surface has nothing to show.", "    ")
  const source = widget(out.data, element("div", ` className="flex flex-col gap-5"`, content, "  "))
  return { source, warnings }
}


/**
 * Read back the surface ref an imported applet was created with (`gbSurface` in its
 * `<Widget data>`), or null when the source has none or no longer compiles.
 */
export function readSurfaceRef(appletSource: unknown): SurfaceRef | null {
  if (typeof appletSource !== "string") return null
  let compiled: ReturnType<typeof compileApplet>
  try {
    compiled = compileApplet(appletSource)
  } catch {
    return null
  }
  if (!compiled.ok) return null
  const ref = record(compiled.tree.scopes.data?.[SURFACE_REF_KEY])
  if (typeof ref.surfaceId !== "string" || !SURFACE_IDENTIFIER.test(ref.surfaceId)) return null
  if (typeof ref.version !== "number" || !Number.isInteger(ref.version) || ref.version < 1) return null
  return typeof ref.title === "string" ? { surfaceId: ref.surfaceId, version: ref.version, title: ref.title } : { surfaceId: ref.surfaceId, version: ref.version }
}
