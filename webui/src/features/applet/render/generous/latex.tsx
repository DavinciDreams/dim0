// The applet <Latex> component. Adapted from Generous (MIT) — KaTeX core only.

import { useMemo } from "react"
import katex from "katex"
import "katex/dist/katex.min.css"

import type { LatexProps } from "./types"


/** Render a TeX expression with KaTeX; invalid TeX shows the error text in red. */
export function Latex({ expression, displayMode = true }: LatexProps) {
  const html = useMemo(
    () =>
      katex.renderToString(typeof expression === "string" ? expression : "", {
        displayMode: displayMode !== false,
        // Render parse errors inline rather than throwing out of the applet.
        throwOnError: false,
        // `trust: false` (default) keeps \href/\includegraphics and friends disabled.
        trust: false,
        strict: "ignore",
      }),
    [expression, displayMode],
  )
  // KaTeX output is its own escaped HTML (no author markup passes through).
  return <div className="overflow-x-auto py-1" dangerouslySetInnerHTML={{ __html: html }} />
}
