// Lazy wrappers for the heavy Generous-derived applet components: Mermaid (~1 MB),
// the markdown renderer and the picture timeline load only when an applet first
// uses them. Fallbacks
// reserve space and report not-ready so exports never snapshot a blank box.

import { Suspense, lazy } from "react"

import { TimelineList } from "./progress"
import { isLegacyListProps } from "./timeline/shape"
import type { CodeBlockProps, LegacyTimelineProps, MarkdownProps, MermaidProps, TimelineProps } from "./types"


const MermaidImpl = lazy(() => import("./mermaid-impl").then((m) => ({ default: m.MermaidImpl })))
const MarkdownView = lazy(() => import("@/components/markdown/markdown-view").then((m) => ({ default: m.MarkdownView })))
const TimelineView = lazy(() => import("./timeline/timeline-view").then((m) => ({ default: m.TimelineView })))


/** Placeholder shown while a lazy component's chunk loads. */
function Loading({ height }: { height?: number }) {
  return <div data-capture-ready="false" aria-label="Loading" style={{ width: "100%", height: height ?? 120 }} />
}


/** The applet `<Mermaid diagram height?>` component. */
export function Mermaid(props: MermaidProps) {
  return (
    <Suspense fallback={<Loading height={props.height} />}>
      <MermaidImpl {...props} />
    </Suspense>
  )
}


/** The applet `<Markdown content omitImages?>` component (sanitized GFM + math + code). */
export function Markdown({ content, omitImages }: MarkdownProps) {
  return (
    <Suspense fallback={<Loading />}>
      <MarkdownView content={typeof content === "string" ? content : ""} omitImages={omitImages === true} />
    </Suspense>
  )
}


/** The applet `<CodeBlock code language?>` component, highlighted via the markdown renderer. */
export function CodeBlock({ code, language }: CodeBlockProps) {
  const body = typeof code === "string" ? code : ""
  // A fence longer than any backtick run in the code can't be closed early by it.
  const longest = Math.max(2, ...(body.match(/`+/g) ?? []).map((run) => run.length))
  const fence = "`".repeat(longest + 1)
  const lang = typeof language === "string" ? language.replace(/[^\w+#-]/g, "") : ""
  return (
    <Suspense fallback={<Loading />}>
      <MarkdownView content={`${fence}${lang}\n${body}\n${fence}`} />
    </Suspense>
  )
}


/**
 * The applet `<Timeline>`. The contract shape (`events` with `start` dates, or a
 * `table`) gets the zoomable picture timeline, loaded on first use; the legacy
 * `{ events: [{ date, title }] }` shape keeps the simple vertical list.
 */
export function Timeline(props: TimelineProps) {
  if (isLegacyListProps(props)) return <TimelineList events={props.events as LegacyTimelineProps["events"]} />
  const height = typeof props.height === "number" && Number.isFinite(props.height) ? Math.min(1600, Math.max(160, props.height)) + 48 : 488
  return (
    <Suspense fallback={<Loading height={height} />}>
      <TimelineView {...props} />
    </Suspense>
  )
}
