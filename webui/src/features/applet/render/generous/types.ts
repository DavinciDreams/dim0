// Prop shapes for the applet components adapted from Generous. Values arrive from
// agent-authored applet source, so every field is treated as possibly malformed.


export interface MermaidProps {
  diagram: string
  height?: number
}


export interface LatexProps {
  expression: string
  displayMode?: boolean
}


export interface MarkdownProps {
  content: string
}


export interface CodeBlockProps {
  code: string
  language?: string
}


export interface JsonViewerProps {
  data: unknown
  /** Depth expanded by default (0 = all collapsed). */
  expandDepth?: number
}


export interface Stat {
  label: string
  value: string | number
  /** Percentage change, e.g. 12.5 or -3. */
  change?: number
  changeLabel?: string
  /** Direction the change should read as good; defaults to "up". */
  goodDirection?: "up" | "down"
  sparkline?: number[]
}


export interface StatsProps {
  stats: Stat[]
  columns?: 1 | 2 | 3 | 4
}


export interface ProgressStep {
  label: string
  status?: "done" | "active" | "pending" | "error"
  description?: string
}


export interface ProgressTrackerProps {
  steps: ProgressStep[]
}


export interface TimelineEvent {
  date: string
  title: string
  description?: string
}


export interface TimelineProps {
  events: TimelineEvent[]
}
