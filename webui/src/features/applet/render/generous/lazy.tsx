// Lazy wrappers for the heavy Generous-derived applet components: Mermaid (~1 MB)
// and the markdown renderer load only when an applet first uses them. Fallbacks
// reserve space and report not-ready so exports never snapshot a blank box.

import { Suspense, lazy } from "react"

import type { CodeBlockProps, MarkdownProps, MermaidProps } from "./types"


const MermaidImpl = lazy(() => import("./mermaid-impl").then((m) => ({ default: m.MermaidImpl })))
const MarkdownView = lazy(() => import("@/components/markdown/markdown-view").then((m) => ({ default: m.MarkdownView })))


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


/** The applet `<Markdown content>` component (sanitized GFM + math + code). */
export function Markdown({ content }: MarkdownProps) {
  return (
    <Suspense fallback={<Loading />}>
      <MarkdownView content={typeof content === "string" ? content : ""} />
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
