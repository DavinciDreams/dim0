// Typed diagram → sanitized SVG. This module pulls in the vendored Archify
// renderers (~350 KB), so it must only be reached through `load.ts`'s dynamic
// import — never statically from board code.

import { placeArchitecture, placeSequence, type ArchitectureLayoutOptions } from "./auto-layout"
import { parseDiagramSpec, type ArchitectureSpec, type DiagramSpec, type ParsedDiagramSpec } from "./schema"
import { sanitizeSvg } from "./sanitize"
import { compileWorkflow, renderArchitecture, renderSequence } from "./vendor/archify/index.mjs"


export type RenderDiagramResult =
  | { ok: true; svg: string; width: number; height: number }
  | { ok: false; error: string }


// Keep errors short enough to hand back to the agent verbatim.
const MAX_ERROR_LINES = 12


/** Trim a renderer error to its first lines; Archify errors are "Title:\n- problem\n- problem". */
const clip = (message: string): string => {
  const lines = message.split("\n")
  if (lines.length <= MAX_ERROR_LINES) return message
  return `${lines.slice(0, MAX_ERROR_LINES).join("\n")}\n- …and ${lines.length - MAX_ERROR_LINES} more`
}


/** Read the `0 0 W H` viewBox Archify stamps on the root <svg>. */
const viewBoxSize = (svg: string): { width: number; height: number } => {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 960, height: 540 }
}


/** Run one Archify renderer; throws with a readable message on a layout violation. */
const renderParsed = (spec: ParsedDiagramSpec): string => {
  if (spec.diagram_type === "architecture") return renderArchitecture(spec)
  if (spec.diagram_type === "sequence") return renderSequence(placeSequence(spec))
  const result = compileWorkflow({ workflow: spec })
  if (result.ok && result.svg) return result.svg
  const details = (result.diagnostics ?? []).map((d) => `- ${d.message}`)
  throw new Error(details.length > 0 ? `Workflow layout validation failed:\n${details.join("\n")}` : (result.error ?? "Workflow compilation failed."))
}


// Layered-layout attempts for an auto-placed architecture, cheapest first. Archify
// rejects routes that cross unrelated components, so a failed attempt retries with
// the other rank direction and then more spacing.
const ARCHITECTURE_ATTEMPTS: ReadonlyArray<ArchitectureLayoutOptions> = [
  { direction: "LR", spacing: 1 },
  { direction: "TB", spacing: 1 },
  { direction: "LR", spacing: 1.6 },
  { direction: "TB", spacing: 1.6 },
]


/** Place + render an architecture, retrying alternative auto-layouts when dagre was used. */
const renderArchitectureSpec = (spec: ArchitectureSpec): string => {
  const layered = spec.components.some((c) => !c.pos && (c.row === undefined || c.col === undefined))
  if (!layered) return renderArchitecture(placeArchitecture(spec))
  let firstError: unknown
  for (const options of ARCHITECTURE_ATTEMPTS) {
    try {
      return renderArchitecture(placeArchitecture(spec, options))
    } catch (err) {
      firstError ??= err
    }
  }
  const message = firstError instanceof Error ? firstError.message : String(firstError)
  throw new Error(
    `${message}\nAuto-layout could not place these components cleanly — give components grid "row"/"col" (or explicit "pos") to control placement.`,
  )
}


/**
 * Validate, auto-place and render a diagram spec to a sanitized SVG string.
 * Never throws: failures come back as `{ ok: false, error }` with a message
 * written for the spec's author (the agent) to act on.
 */
export const renderDiagram = (spec: DiagramSpec): RenderDiagramResult => {
  const parsed = parseDiagramSpec(spec)
  if (!parsed.ok) return parsed
  let raw: string
  try {
    raw = parsed.spec.diagram_type === "architecture" ? renderArchitectureSpec(parsed.spec) : renderParsed(parsed.spec)
  } catch (err) {
    return { ok: false, error: clip(err instanceof Error ? err.message : String(err)) }
  }
  const svg = sanitizeSvg(raw)
  if (!svg) return { ok: false, error: "Diagram rendered to an empty SVG." }
  return { ok: true, svg, ...viewBoxSize(svg) }
}


/** `renderDiagram` for a note's raw `content` (JSON text), with a readable parse error. */
export const renderDiagramSource = (source: string): RenderDiagramResult => {
  let spec: unknown
  try {
    spec = JSON.parse(source)
  } catch (err) {
    return { ok: false, error: `Diagram content is not valid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
  return renderDiagram(spec as DiagramSpec)
}
