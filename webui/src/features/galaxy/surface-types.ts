// TypeScript shapes for Galaxy Brain's `gb.surface.v1` surface contract
// (GalaxyBrain services/galaxy-brain-api/contracts/gb.surface.v1.json, catalog
// `generous.a2ui` v1). A surface is a bounded, presentation-only UI spec: a flat
// list of components with stable ids, linked into a tree by `parentId` /
// `children`, plus declared data bindings. Dim-0 receives the *materialized* spec
// (bindings already resolved into props by Galaxy Brain's /resolve endpoint), so
// these types describe what a prop may hold, not a promise that it does — every
// value arriving from the network is still checked at runtime.


export const SURFACE_SCHEMA_ID = "gb.surface.v1"
export const SURFACE_CATALOG = { id: "generous.a2ui", version: "1" } as const


/** The contract's bounds (`schema.bounds`), enforced on import. */
export const SURFACE_BOUNDS = {
  maxComponents: 64,
  maxBindings: 64,
  maxJsonBytes: 262_144,
  maxStringLength: 20_000,
  maxDepth: 10,
  maxValueNodes: 4096,
} as const


/** `schema.identifierPattern` — component ids, surface ids, resource ids. */
export const SURFACE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/


/** `schema.forbiddenPropertyNames` / `forbiddenPropertyPattern` / `forbiddenStringFragments`. */
export const SURFACE_FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "action",
  "actions",
  "constructor",
  "dangerouslySetInnerHTML",
  "handler",
  "prototype",
  "script",
  "srcDoc",
  "__proto__",
])
export const SURFACE_FORBIDDEN_KEY_PATTERN = /^on[A-Z_]/
export const SURFACE_FORBIDDEN_FRAGMENTS = ["javascript:", "<script"] as const


/** The 17 component types of the `generous.a2ui` v1 catalog. */
export const SURFACE_COMPONENT_TYPES = [
  "Badge",
  "Card",
  "Charts",
  "Column",
  "DataTable",
  "Grid",
  "Heading",
  "KnowledgeGraph",
  "Markdown",
  "Row",
  "Separator",
  "Stack",
  "StatsDisplay",
  "SVGPreview",
  "Text",
  "Timeline",
  "Title",
] as const

export type SurfaceComponentType = (typeof SURFACE_COMPONENT_TYPES)[number]


type Distribution = "start" | "center" | "end" | "spaceBetween" | "spaceAround" | "spaceEvenly"
type CrossAlign = "start" | "center" | "end" | "stretch"
type HeadingHint = "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
type Size = number | string


export interface BadgeSurfaceProps {
  text: string
  variant?: "filled" | "outline" | "secondary" | "destructive"
}

/** Card takes no props; its content is its children. */
export type CardSurfaceProps = Record<string, never>

export interface FlexSurfaceProps {
  distribution?: Distribution
  align?: CrossAlign
}

export interface GridSurfaceProps {
  columns?: number | string
  gap?: "0" | "1" | "2" | "3" | "4" | "5" | "6" | "8" | "10" | "12"
}

export interface HeadingSurfaceProps {
  text: string
  usageHint?: HeadingHint
}

export interface TextSurfaceProps {
  text: string
  usageHint?: "body" | "caption" | HeadingHint
}

export interface SeparatorSurfaceProps {
  orientation?: "horizontal" | "vertical"
  decorative?: boolean
}

export interface ChartPoint {
  x: string | number
  y: number
  label?: string
}

export interface ChartSeries {
  name: string
  color?: string
  data: ChartPoint[]
}

export type ChartKind =
  | "line" | "bar" | "pie" | "scatter" | "area" | "radar" | "histogram" | "heatmap" | "funnel"
  | "gauge" | "candlestick" | "sankey" | "chord" | "treemap" | "forceDirected" | "hierarchy"
  | "wordCloud" | "venn"

export interface ChartsSurfaceProps {
  data: {
    title?: string
    type?: ChartKind
    series?: ChartSeries[]
    data?: unknown[]
    stages?: unknown[]
    value?: number
    min?: number
    max?: number
    target?: number
    sankeyNodes?: unknown[]
    sankeyLinks?: unknown[]
    chordNodes?: unknown[]
    chordLinks?: unknown[]
    treeMapData?: unknown[]
    graphNodes?: unknown[]
    graphLinks?: unknown[]
    hierarchyData?: Record<string, unknown>
    words?: unknown[]
    vennSets?: unknown[]
    vennIntersections?: unknown[]
    ranges?: unknown[]
    showVolume?: boolean
    binCount?: number
    xAxis?: Record<string, unknown>
    yAxis?: Record<string, unknown>
  }
  options?: { height?: Size; width?: Size; animated?: boolean; showLegend?: boolean; theme?: "light" | "dark" }
}

export interface DataTableColumn {
  id: string
  header: string
  accessorKey?: string
  width?: number
  minWidth?: number
  maxWidth?: number
  enableSorting?: boolean
  enableFiltering?: boolean
  align?: "left" | "center" | "right"
}

export interface DataTableSurfaceProps {
  data: { title?: string; columns: DataTableColumn[]; rows: Record<string, unknown>[] }
  options?: {
    height?: Size
    width?: Size
    enableSorting?: boolean
    enableFiltering?: boolean
    enablePagination?: boolean
    pageSize?: number
    pageSizeOptions?: number[]
    enableRowSelection?: boolean
    enableMultiRowSelection?: boolean
    striped?: boolean
    bordered?: boolean
    compact?: boolean
    stickyHeader?: boolean
  }
}

export interface KnowledgeEntity {
  id: string
  label: string
  type: "person" | "organization" | "concept" | "location" | "event" | "document" | "custom"
  description?: string
  properties?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface KnowledgeRelationship {
  id: string
  source: string
  target: string
  type: string
  label?: string
  bidirectional?: boolean
  properties?: Record<string, unknown>
}

export interface KnowledgeGraphSurfaceProps {
  title?: string
  data: { entities: KnowledgeEntity[]; relationships: KnowledgeRelationship[] }
  options?: {
    layout?: "force" | "hierarchical" | "radial" | "manual"
    showLabels?: boolean
    showTypes?: boolean
    interactive?: boolean
    colorScheme?: Record<string, string>
  }
}

export interface MarkdownSurfaceProps {
  data: { content: string; title?: string }
  options?: Record<string, unknown>
}

export interface StatFormat {
  kind: "text" | "number" | "currency" | "percent"
  currency?: string
  decimals?: number
  compact?: boolean
  basis?: "fraction" | "unit"
}

export interface StatItem {
  key: string
  label: string
  value: string | number
  format?: StatFormat
  diff?: { value: number; decimals?: number; upIsPositive?: boolean; label?: string }
  sparkline?: { data: number[]; color?: string }
}

export interface StatsDisplaySurfaceProps {
  id: string
  role?: "information" | "decision" | "control" | "state" | "composite"
  title?: string
  description?: string
  stats: StatItem[]
}

export interface TimelineDate {
  year: number
  month?: number
  day?: number
  display_date?: string
}

export interface TimelineSurfaceEvent {
  unique_id?: string
  start_date?: TimelineDate
  end_date?: Record<string, unknown>
  text?: { headline?: string; text?: string }
  media?: { url: string; caption?: string; credit?: string; alt?: string }
  group?: string
  display_date?: string
  autolink?: boolean
}

export interface TimelineSurfaceProps {
  data: { events: TimelineSurfaceEvent[]; scale?: "human" | "cosmological" }
  options?: Record<string, unknown>
}

export interface SvgPreviewSurfaceProps {
  svg: string
  title?: string
  filename?: string
  width?: Size
  height?: Size
}


/** Props per component type (as the contract declares them). */
export interface SurfacePropsByType {
  Badge: BadgeSurfaceProps
  Card: CardSurfaceProps
  Charts: ChartsSurfaceProps
  Column: FlexSurfaceProps
  DataTable: DataTableSurfaceProps
  Grid: GridSurfaceProps
  Heading: HeadingSurfaceProps
  KnowledgeGraph: KnowledgeGraphSurfaceProps
  Markdown: MarkdownSurfaceProps
  Row: FlexSurfaceProps
  Separator: SeparatorSurfaceProps
  Stack: FlexSurfaceProps
  StatsDisplay: StatsDisplaySurfaceProps
  SVGPreview: SvgPreviewSurfaceProps
  Text: TextSurfaceProps
  Timeline: TimelineSurfaceProps
  Title: HeadingSurfaceProps
}


/** One component: exactly one `{ <Type>: props }` entry, linked by parentId / children. */
export interface SurfaceComponent {
  id: string
  component: Partial<{ [T in SurfaceComponentType]: SurfacePropsByType[T] }>
  parentId?: string
  children?: string[]
}


export type SurfaceBindingKind = "galaxy.eln.experiment" | "galaxy.eln.hypothesis" | "galaxy.ham.task"


export interface SurfaceBinding {
  id: string
  target: { componentId: string; prop: string }
  source: { kind: SurfaceBindingKind; resourceId?: string; query?: Record<string, unknown> }
}


export interface GalaxySurfaceSpec {
  schema: typeof SURFACE_SCHEMA_ID
  catalog: { id: "generous.a2ui"; version: "1" }
  surfaceUpdate: { surfaceId?: string; components: SurfaceComponent[] }
  bindings: SurfaceBinding[]
}


/** Which Galaxy Brain surface revision an applet was imported from. */
export interface SurfaceRef {
  surfaceId: string
  version: number
  title?: string
}
