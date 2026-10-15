// The applet <SVGPreview svg title? width?> component: a static, untrusted SVG
// drawing. Adapted from Generous's SVGPreview (github.com/DavinciDreams/Generous-Works,
// MIT) by way of Galaxy Brain's `components/surfaces/surface-svg.tsx`, whose
// rebuild-don't-inject renderer and policy (./svg-policy) it mirrors exactly so a
// gb.surface.v1 SVGPreview draws the same here as there.
//
// The source never reaches the DOM as markup. It is parsed into a detached XML
// document (no browsing context — nothing in it runs or loads) and a fresh drawing
// is built one node at a time, the policy deciding every element and attribute;
// text arrives as text nodes and attributes through setAttribute. DOMPurify (SVG
// profile, widened only to the policy's own allowlist) then re-checks the rebuilt
// drawing in place as defence in depth before it is attached.

import { useEffect, useId, useRef, useState } from "react"

import { useCaptureReady } from "@/lib/canvas/use-capture-ready"

import { drawingFrom } from "./svg-drawing"
import type { SvgPreviewProps } from "./types"


/**
 * The contract's width caps the preview; height is accepted but not applied, since
 * the drawing's own aspect ratio decides it (a fixed height would crop it).
 * Re-checked here rather than trusted.
 */
function maximumWidth(width: unknown): string | undefined {
  if (typeof width === "number" && width > 0 && width <= 4096) return `${width}px`
  if (typeof width === "string" && width.length <= 16 && /^[0-9]+(\.[0-9]+)?(px|%|em|rem)?$/.test(width)) {
    return /[a-z%]$/.test(width) ? width : `${width}px`
  }
  return undefined
}


/** Render an untrusted SVG string as a rebuilt, allowlisted drawing. */
export function SVGPreview({ svg, title, width }: SvgPreviewProps) {
  const container = useRef<HTMLDivElement>(null)
  const figure = useRef<HTMLElement>(null)
  const prefix = `svg${useId().replace(/[^A-Za-z0-9_-]/g, "")}`
  const [problem, setProblem] = useState("")
  const [rendered, setRendered] = useState(false)
  const caption = typeof title === "string" && title.trim() ? title.trim() : ""
  useCaptureReady(figure, rendered)

  useEffect(() => {
    const host = container.current
    if (!host) return
    const drawing = drawingFrom(svg, prefix)
    if (typeof drawing === "string") {
      host.replaceChildren()
      setProblem(drawing)
    } else {
      setProblem("")
      host.replaceChildren(drawing)
    }
    setRendered(true)
    return () => {
      host.replaceChildren()
      setRendered(false)
    }
  }, [prefix, svg])

  return (
    <figure ref={figure} className="space-y-2" data-slot="svg-preview" style={{ maxWidth: maximumWidth(width) }}>
      <div
        ref={container}
        role="img"
        aria-label={caption || "Diagram"}
        className="overflow-hidden rounded-xl border border-border bg-card p-3 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      />
      {problem ? <p role="alert" className="text-sm text-destructive">This diagram was not shown: {problem}.</p> : null}
      {caption ? <figcaption className="text-sm text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  )
}
