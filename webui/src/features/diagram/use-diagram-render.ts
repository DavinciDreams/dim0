// React hook: render a diagram note's JSON content to a sanitized, id-scoped SVG.
// The renderer module is loaded lazily on first use (see load.ts), and results are
// memoized by source so remounts (LOD swaps, scroll-back) don't re-run layout.

import { useEffect, useState } from "react"

import { loadDiagramRenderer } from "./load"


export type DiagramRenderState =
  | { status: "loading" }
  | { status: "ok"; svg: string; width: number; height: number }
  | { status: "error"; error: string }


type RenderOutcome = Exclude<DiagramRenderState, { status: "loading" }>


const CACHE_LIMIT = 64
const cache = new Map<string, RenderOutcome>()


/** Render (or fetch from cache) the unscoped outcome for a source string. */
const renderCached = async (source: string): Promise<RenderOutcome> => {
  const hit = cache.get(source)
  if (hit) return hit
  const mod = await loadDiagramRenderer()
  const r = mod.renderDiagramSource(source)
  const outcome: RenderOutcome = r.ok
    ? { status: "ok", svg: r.svg, width: r.width, height: r.height }
    : { status: "error", error: r.error }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value ?? "")
  cache.set(source, outcome)
  return outcome
}


/**
 * Render `source` (a diagram spec as JSON text). `scope` prefixes the SVG's ids so
 * several diagrams on one board don't share markers/patterns.
 */
export const useDiagramRender = (source: string, scope: string): DiagramRenderState => {
  const [state, setState] = useState<{ key: string; value: DiagramRenderState }>({ key: "", value: { status: "loading" } })
  const key = `${scope}\u0000${source}`

  useEffect(() => {
    let cancelled = false
    renderCached(source)
      .then(async (outcome) => {
        if (outcome.status !== "ok") return outcome
        const { scopeSvgIds } = await loadDiagramRenderer()
        return { ...outcome, svg: scopeSvgIds(outcome.svg, scope) }
      })
      .catch((err: unknown): RenderOutcome => ({ status: "error", error: `Diagram renderer failed to load: ${String(err)}` }))
      .then((value) => {
        if (!cancelled) setState({ key, value })
      })
    return () => {
      cancelled = true
    }
  }, [key, source, scope])

  return state.key === key ? state.value : { status: "loading" }
}
