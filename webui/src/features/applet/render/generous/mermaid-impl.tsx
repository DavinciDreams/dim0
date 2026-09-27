// Mermaid renderer for the applet <Mermaid> component. Adapted from Generous
// (github.com/DavinciDreams/Generous-Works, MIT) — the diagram core only; the
// header/fullscreen/download chrome is left to the board.

import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"

import { useTheme } from "@/components/theme-provider"

import type { MermaidProps } from "./types"


let renderSeq = 0


/** Render a Mermaid definition to SVG; parse errors show inline instead of throwing. */
export function MermaidImpl({ diagram, height }: MermaidProps) {
  const { resolvedTheme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const source = typeof diagram === "string" ? diagram : ""

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setError(null)
    const run = async (): Promise<void> => {
      // `strict` makes Mermaid sanitize labels and disables click/script hooks.
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: resolvedTheme === "dark" ? "dark" : "neutral" })
      // Parse first: a failed `render` leaves an error SVG behind in <body>.
      await mermaid.parse(source)
      const { svg } = await mermaid.render(`applet-mermaid-${++renderSeq}`, source)
      if (cancelled || !ref.current) return
      ref.current.innerHTML = svg
      setReady(true)
    }
    run().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Invalid Mermaid diagram")
    })
    return () => {
      cancelled = true
    }
  }, [source, resolvedTheme])

  if (error) {
    return (
      <div data-capture-ready="true" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        {error}
      </div>
    )
  }
  return (
    <div
      ref={ref}
      data-capture-ready={ready ? "true" : "false"}
      className="flex w-full items-center justify-center overflow-auto [&_svg]:h-auto [&_svg]:max-w-full"
      style={height ? { height } : undefined}
    />
  )
}
