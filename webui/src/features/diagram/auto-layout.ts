// Auto-placement pre-passes: fill in the coordinates Archify requires so an
// author (usually the agent) can describe WHAT is in a diagram, not WHERE.
//
//   - architecture: components without `pos` are placed on a grid from
//     `row`/`col` (Archify's own grid math), or — when neither is given — by a
//     layered dagre layout over the connections. Missing `size` is derived from
//     the label so Archify's label-fit checks pass.
//   - sequence: messages without `y` are spaced evenly in array order;
//     activations/segments that reference message ids resolve to those y values;
//     the viewBox grows to fit the participants and the timeline.
//
// Explicit coordinates always win. Pure functions: specs in, new specs out.

import dagre from "@dagrejs/dagre"

import {
  availableNodeTextWidth,
  DEFAULT_GRID,
  minimumNodeTextWidth,
  resolveComponentPos,
  textUnits,
  type ArchifyGrid,
} from "./vendor/archify/index.mjs"
import type { ArchitectureSpec, SequenceSpec } from "./schema"


type Component = ArchitectureSpec["components"][number]
type Vec = [number, number]


// Archify architecture constants (render-architecture.mjs `layout` + validation).
const MIN_COMPONENT_W = 120
const COMPONENT_H = 60
const COMPONENT_H_WITH_TAG = 64
const LABEL_UNIT_PX = 6.6
const SUBLABEL_MIN_FONT = 6
const MAX_COMPONENT_W = 360
// Top-left of the auto-placed block: leaves room for boundary frames + titles.
const ORIGIN: Vec = [60, 80]


/** Box size that satisfies Archify's label / sublabel / tag fit checks. */
export const componentSize = (c: Pick<Component, "label" | "sublabel" | "tag">): Vec => {
  let w = Math.max(MIN_COMPONENT_W, Math.ceil(textUnits(c.label) * LABEL_UNIT_PX + 16))
  for (const text of [c.sublabel, c.tag]) {
    if (!text) continue
    while (w < MAX_COMPONENT_W && minimumNodeTextWidth(text, SUBLABEL_MIN_FONT) > availableNodeTextWidth(w)) w += 10
  }
  return [w, c.tag ? COMPONENT_H_WITH_TAG : COMPONENT_H]
}


export type LayeredDirection = "LR" | "TB"


export interface ArchitectureLayoutOptions {
  /** Rank direction for the dagre fallback. */
  direction?: LayeredDirection
  /** Multiplier on dagre's node/rank separation (retries widen the layout). */
  spacing?: number
}


/** Place components on Archify's fixed-cell grid, with cells sized to the largest box. */
const gridPositions = (spec: ArchitectureSpec, pending: Component[], sizes: Map<string, Vec>): Map<string, Vec> => {
  const maxW = Math.max(...pending.map((c) => sizes.get(c.id)?.[0] ?? MIN_COMPONENT_W))
  const maxH = Math.max(...pending.map((c) => sizes.get(c.id)?.[1] ?? COMPONENT_H))
  const maxCol = Math.max(...pending.map((c) => c.col ?? 0))
  const grid: ArchifyGrid = {
    ...DEFAULT_GRID,
    origin: ORIGIN,
    cols: Math.min(12, maxCol + 1),
    cellW: maxW,
    cellH: maxH,
    gapX: 70,
    gapY: 60,
    // Authored grid fields win; drop undefined keys so they don't erase defaults.
    ...Object.fromEntries(Object.entries(spec.layout ?? {}).filter(([, v]) => v !== undefined)),
  }
  return new Map(pending.map((c) => [c.id, resolveComponentPos(c, grid)]))
}


/** Layered layout over the connections; boundaries become dagre clusters so members stay together. */
const layeredPositions = (
  spec: ArchitectureSpec,
  pending: Component[],
  sizes: Map<string, Vec>,
  { direction = "LR", spacing = 1 }: ArchitectureLayoutOptions,
): Map<string, Vec> => {
  const g = new dagre.graphlib.Graph({ multigraph: true, compound: true })
  g.setGraph({ rankdir: direction, nodesep: 50 * spacing, ranksep: 80 * spacing, marginx: 0, marginy: 0 })
  g.setDefaultEdgeLabel(() => ({}))
  const ids = new Set(pending.map((c) => c.id))
  for (const c of pending) {
    const [w, h] = sizes.get(c.id) ?? [MIN_COMPONENT_W, COMPONENT_H]
    g.setNode(c.id, { width: w, height: h })
  }
  // Each component joins its smallest enclosing boundary; nested boundaries nest
  // their clusters. dagre allows one parent per node, so a component wrapped by
  // two unrelated boundaries only clusters with the smaller one.
  const boundaries = [...(spec.boundaries ?? [])]
    .map((b, i) => ({ key: `__boundary_${i}`, members: new Set(b.wraps.filter((w) => ids.has(w))) }))
    .filter((b) => b.members.size > 0)
    .sort((a, b) => a.members.size - b.members.size)
  const parentOf = new Map<string, string>()
  for (const b of boundaries) {
    g.setNode(b.key, { paddingTop: 40, paddingBottom: 30, paddingLeft: 30, paddingRight: 30 })
    for (const m of b.members) if (!parentOf.has(m)) parentOf.set(m, b.key)
  }
  for (const [i, inner] of boundaries.entries()) {
    const outer = boundaries.slice(i + 1).find((o) => [...inner.members].every((m) => o.members.has(m)) && o.members.size > inner.members.size)
    if (outer) g.setParent(inner.key, outer.key)
  }
  for (const [child, parent] of parentOf) g.setParent(child, parent)
  for (const [i, conn] of (spec.connections ?? []).entries()) {
    if (!ids.has(conn.from) || !ids.has(conn.to) || conn.from === conn.to) continue
    const labelW = conn.label ? textUnits(conn.label) * 5.4 + 16 : 0
    g.setEdge(conn.from, conn.to, { width: labelW, height: conn.label ? 18 : 0, labelpos: "c" }, `e${i}`)
  }
  dagre.layout(g)
  const out = new Map<string, Vec>()
  for (const c of pending) {
    const n = g.node(c.id)
    const [w, h] = sizes.get(c.id) ?? [MIN_COMPONENT_W, COMPONENT_H]
    out.set(c.id, [n.x - w / 2, n.y - h / 2])
  }
  return out
}


/**
 * Give every architecture component a `pos` and `size`. Returns the spec
 * unchanged (same object) when nothing needed placing, so callers can tell.
 */
export const placeArchitecture = (spec: ArchitectureSpec, options: ArchitectureLayoutOptions = {}): ArchitectureSpec => {
  const pending = spec.components.filter((c) => !c.pos)
  const needsSize = spec.components.some((c) => !c.size)
  if (pending.length === 0 && !needsSize) return spec
  const sizes = new Map<string, Vec>(spec.components.map((c) => [c.id, c.size ?? componentSize(c)]))
  let positions = new Map<string, Vec>()
  if (pending.length > 0) {
    const allGridded = pending.every((c) => c.row !== undefined && c.col !== undefined)
    positions = allGridded ? gridPositions(spec, pending, sizes) : layeredPositions(spec, pending, sizes, options)
    // Normalize the auto-placed block to ORIGIN, below any explicitly placed components.
    const placed = spec.components.filter((c) => c.pos)
    const floorY = placed.length > 0 ? Math.max(...placed.map((c) => (c.pos?.[1] ?? 0) + (sizes.get(c.id)?.[1] ?? 0))) + 90 : ORIGIN[1]
    const minX = Math.min(...[...positions.values()].map((p) => p[0]))
    const minY = Math.min(...[...positions.values()].map((p) => p[1]))
    for (const [key, [x, y]] of positions) {
      positions.set(key, [Math.round(x - minX + ORIGIN[0]), Math.round(y - minY + floorY)])
    }
  }
  return {
    ...spec,
    components: spec.components.map((c) => ({
      ...c,
      pos: c.pos ?? positions.get(c.id),
      size: sizes.get(c.id),
    })),
  }
}


// Archify sequence constants (render-sequence.mjs `layout` + validation).
const SEQ_FIRST_Y = 176
const SEQ_STEP = 40
const SEQ_BOTTOM_RESERVE = 65 + 18 + 24
const SEQ_SIDE_MARGIN = 62
const SEQ_FIXED_PARTICIPANT_W = 86
const SEQ_FIXED_GAP = 108
const SEQ_MAX_PARTICIPANT_W = 190
const SEQ_DEFAULT_VIEWBOX: Vec = [920, 760]


/** Participant box width needed for every label/sublabel to pass Archify's fit checks. */
const neededParticipantWidth = (spec: SequenceSpec): number => {
  let need = SEQ_FIXED_PARTICIPANT_W
  for (const p of spec.participants) {
    need = Math.max(need, Math.ceil(textUnits(p.label) * 6.8 - 6))
    if (p.sublabel) {
      let w = need
      while (w < SEQ_MAX_PARTICIPANT_W && minimumNodeTextWidth(p.sublabel, 6) > availableNodeTextWidth(w)) w += 4
      need = w
    }
  }
  return Math.min(SEQ_MAX_PARTICIPANT_W, need)
}


/**
 * Fill in sequence message `y` values (even spacing in array order), resolve
 * message-id references in activations/segments, and size the viewBox.
 */
export const placeSequence = (spec: SequenceSpec): SequenceSpec => {
  const ys: number[] = []
  for (const m of spec.messages) {
    const prev = ys.length > 0 ? ys[ys.length - 1] : undefined
    ys.push(m.y ?? (prev === undefined ? SEQ_FIRST_Y : prev + SEQ_STEP))
  }
  const messages = spec.messages.map((m, i) => ({ ...m, y: ys[i] }))
  const yOf = new Map(messages.flatMap((m) => (m.id ? [[m.id, m.y] as const] : [])))
  const resolve = (ref: number | string, offset: number): number => (typeof ref === "number" ? ref : (yOf.get(ref) ?? 0) + offset)

  const meta = { ...spec.meta }
  if (!meta.viewBox) {
    const n = spec.participants.length
    const needW = neededParticipantWidth(spec)
    let width: number
    if (needW > SEQ_FIXED_PARTICIPANT_W && meta.column_fit !== "fixed") {
      meta.column_fit = "spread"
      width = (needW + 25) * n + SEQ_SIDE_MARGIN * 2
    } else {
      width = SEQ_SIDE_MARGIN + (n - 1) * SEQ_FIXED_GAP + SEQ_FIXED_PARTICIPANT_W / 2 + 40
    }
    const segmentBottom = Math.max(0, ...(spec.segments ?? []).map((s) => resolve(s.to, 12)))
    const height = Math.max(Math.max(...ys) + SEQ_BOTTOM_RESERVE, segmentBottom + 65, 480)
    meta.viewBox = [Math.max(SEQ_DEFAULT_VIEWBOX[0], Math.ceil(width)), Math.ceil(height)]
  }

  return {
    ...spec,
    meta,
    messages,
    activations: spec.activations?.map((a) => ({ ...a, from: resolve(a.from, -6), to: resolve(a.to, 6) })),
    segments: spec.segments?.map((s) => ({ ...s, from: resolve(s.from, -14), to: resolve(s.to, 12) })),
  }
}
