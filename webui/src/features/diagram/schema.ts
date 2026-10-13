// Zod schemas for the `diagram` note's JSON spec.
//
// Mirrors the Archify JSON Schemas (vendor/archify, pinned in its README) for the
// subset dim0 renders — architecture, sequence and workflow — with three
// deliberate differences:
//   - unknown keys are STRIPPED, not rejected (brand marks, cards, views, animation
//     and presets are viewer features dim0 doesn't render);
//   - coordinates are optional where dim0 can auto-place (architecture `pos`,
//     sequence message `y`), and sequence activations/segments may reference
//     message ids instead of raw y values;
//   - `schema_version` is optional (defaults: 1, workflow 2).

import { z } from "zod"


const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/


const id = z.string().regex(ID_PATTERN, "must start with a letter and use only letters, digits, _ or -")
const point = z.tuple([z.number(), z.number()])
const side = z.enum(["left", "right", "top", "bottom"])
const componentType = z.enum(["frontend", "backend", "database", "cloud", "security", "messagebus", "external"])
const variant = z.enum(["default", "emphasis", "security", "dashed"])
const label = z.string().min(1, "must not be empty")


const legend = z.object({ mode: z.enum(["auto", "all", "hidden"]).optional() })


/** `meta` shared by every diagram type; `viewBox` minimums differ per type. */
const meta = (minW: number, minH: number) =>
  z.object({
    title: label,
    subtitle: z.string().optional(),
    locale: z.enum(["en", "zh-CN"]).optional(),
    legend: legend.optional(),
    viewBox: z.tuple([z.number().min(minW), z.number().min(minH)]).optional(),
  })


const architectureSchema = z.object({
  schema_version: z.literal(1).default(1),
  diagram_type: z.literal("architecture"),
  meta: meta(320, 240),
  layout: z
    .object({
      mode: z.literal("grid"),
      origin: point.optional(),
      cols: z.number().int().min(1).max(12).optional(),
      gapX: z.number().min(0).optional(),
      gapY: z.number().min(0).optional(),
      cellW: z.number().min(40).optional(),
      cellH: z.number().min(24).optional(),
    })
    .optional(),
  components: z
    .array(
      z.object({
        id,
        type: componentType,
        label,
        sublabel: z.string().optional(),
        tag: z.string().optional(),
        row: z.number().int().min(0).optional(),
        col: z.number().int().min(0).optional(),
        pos: point.optional(),
        size: z.tuple([z.number().positive(), z.number().positive()]).optional(),
      }),
    )
    .min(1),
  boundaries: z
    .array(
      z.object({
        kind: z.enum(["region", "security-group"]),
        label,
        wraps: z.array(id).min(1),
        pad: z.number().min(0).optional(),
      }),
    )
    .optional(),
  connections: z
    .array(
      z.object({
        id: id.optional(),
        from: id,
        to: id,
        label: z.string().optional(),
        variant: variant.optional(),
        fromSide: side.optional(),
        toSide: side.optional(),
        route: z.enum(["auto", "straight", "orthogonal-h", "orthogonal-v"]).optional(),
        via: z.array(point).optional(),
        labelAt: point.optional(),
        labelDx: z.number().optional(),
        labelDy: z.number().optional(),
        labelSegment: z.number().int().min(0).optional(),
        width: z.number().min(0.5).optional(),
      }),
    )
    .optional(),
})


/** A y coordinate, or (dim0 extension) the id of a message whose y it resolves to. */
const yRef = z.union([z.number(), id])


const sequenceSchema = z.object({
  schema_version: z.literal(1).default(1),
  diagram_type: z.literal("sequence"),
  meta: meta(480, 480).extend({ column_fit: z.enum(["fixed", "spread"]).optional() }),
  participants: z
    .array(z.object({ id, type: componentType, label, sublabel: z.string().optional() }))
    .min(2),
  segments: z.array(z.object({ from: yRef, to: yRef, label })).optional(),
  messages: z
    .array(
      z.object({
        id: id.optional(),
        from: id,
        to: id,
        y: z.number().min(160).optional(),
        label,
        variant: z.enum(["default", "emphasis", "security", "dashed", "return"]).optional(),
        note: z.string().optional(),
      }),
    )
    .min(1),
  activations: z
    .array(z.object({ participant: id, from: yRef, to: yRef, type: componentType.optional() }))
    .optional(),
})


const col = z.number().int().min(0).max(5)


const workflowSchema = z.object({
  schema_version: z.union([z.literal(1), z.literal(2)]).default(2),
  diagram_type: z.literal("workflow"),
  meta: meta(700, 240),
  lanes: z
    .array(z.object({ id, label, variant: z.enum(["normal", "exception"]).optional() }))
    .min(1),
  phases: z
    .array(z.object({ id, label, fromCol: col, toCol: col, variant: variant.optional() }))
    .optional(),
  groups: z
    .array(z.object({ id, label, lane: id, fromCol: col, toCol: col, variant: variant.optional() }))
    .optional(),
  mainPath: z.array(id).min(2).optional(),
  nodes: z
    .array(
      z.object({
        id,
        lane: id,
        col,
        type: componentType,
        label,
        sublabel: z.string().optional(),
        tag: z.string().optional(),
        width: z.number().min(32).optional(),
        height: z.number().min(32).optional(),
        yOffset: z.number().optional(),
      }),
    )
    .min(1),
  edges: z.array(
    z.object({
      id: id.optional(),
      from: id,
      to: id,
      label: z.string().optional(),
      variant: variant.optional(),
      role: z.enum(["main", "branch", "async", "return", "error"]).optional(),
      fromSide: side.optional(),
      toSide: side.optional(),
      route: z
        .enum(["auto", "straight", "drop", "outside-right", "return-left", "bottom-channel", "up-channel"])
        .optional(),
      via: z.array(point).optional(),
      labelAt: point.optional(),
      labelDx: z.number().optional(),
      labelDy: z.number().optional(),
      labelSegment: z.number().int().min(0).optional(),
      channelX: z.number().optional(),
      channelY: z.number().optional(),
      bias: z.number().min(0).max(1).optional(),
      width: z.number().min(0.5).optional(),
    }),
  ),
})


export const diagramSpecSchema = z.discriminatedUnion("diagram_type", [
  architectureSchema,
  sequenceSchema,
  workflowSchema,
])


/** A diagram spec as authored (optional fields may be omitted). */
export type DiagramSpec = z.input<typeof diagramSpecSchema>
/** A validated spec with defaults applied. */
export type ParsedDiagramSpec = z.output<typeof diagramSpecSchema>
export type ArchitectureSpec = z.output<typeof architectureSchema>
export type SequenceSpec = z.output<typeof sequenceSchema>
export type WorkflowSpec = z.output<typeof workflowSchema>
export type DiagramType = ParsedDiagramSpec["diagram_type"]


export const DIAGRAM_TYPES: ReadonlyArray<DiagramType> = ["architecture", "sequence", "workflow"]


/** Collect cross-reference problems (duplicate ids, dangling from/to) zod can't express per-field. */
const referenceProblems = (spec: ParsedDiagramSpec): string[] => {
  const problems: string[] = []
  const checkUnique = (kind: string, ids: string[]): Set<string> => {
    const seen = new Set<string>()
    for (const i of ids) {
      if (seen.has(i)) problems.push(`duplicate ${kind} id "${i}"`)
      seen.add(i)
    }
    return seen
  }
  const checkRefs = (where: string, known: Set<string>, refs: Record<string, string | number | undefined>): void => {
    for (const [field, ref] of Object.entries(refs)) {
      if (typeof ref !== "string" || known.has(ref)) continue
      problems.push(`${where} ${field} "${ref}" is not a known id (known: ${[...known].join(", ") || "none"})`)
    }
  }
  if (spec.diagram_type === "architecture") {
    const ids = checkUnique("component", spec.components.map((c) => c.id))
    for (const [i, c] of (spec.connections ?? []).entries()) checkRefs(`connections[${i}]`, ids, { from: c.from, to: c.to })
    for (const [i, b] of (spec.boundaries ?? []).entries()) {
      for (const w of b.wraps) checkRefs(`boundaries[${i}]`, ids, { wraps: w })
    }
  } else if (spec.diagram_type === "sequence") {
    const ids = checkUnique("participant", spec.participants.map((p) => p.id))
    const messageIds = checkUnique("message", spec.messages.flatMap((m) => (m.id ? [m.id] : [])))
    for (const [i, m] of spec.messages.entries()) checkRefs(`messages[${i}]`, ids, { from: m.from, to: m.to })
    for (const [i, a] of (spec.activations ?? []).entries()) {
      checkRefs(`activations[${i}]`, ids, { participant: a.participant })
      checkRefs(`activations[${i}]`, messageIds, { from: a.from, to: a.to })
    }
    for (const [i, s] of (spec.segments ?? []).entries()) checkRefs(`segments[${i}]`, messageIds, { from: s.from, to: s.to })
  } else {
    const lanes = checkUnique("lane", spec.lanes.map((l) => l.id))
    const ids = checkUnique("node", spec.nodes.map((n) => n.id))
    for (const [i, n] of spec.nodes.entries()) checkRefs(`nodes[${i}]`, lanes, { lane: n.lane })
    for (const [i, e] of spec.edges.entries()) checkRefs(`edges[${i}]`, ids, { from: e.from, to: e.to })
    for (const [i, g] of (spec.groups ?? []).entries()) checkRefs(`groups[${i}]`, lanes, { lane: g.lane })
  }
  return problems
}


/** Render a zod issue path as `/components/2 (id "api")/type` so the author can find it. */
const describePath = (path: ReadonlyArray<PropertyKey>, input: unknown): string => {
  if (path.length === 0) return "/"
  let node: unknown = input
  let out = ""
  for (const seg of path) {
    out += `/${String(seg)}`
    node = node && typeof node === "object" ? (node as Record<PropertyKey, unknown>)[seg] : undefined
    const nodeId = node && typeof node === "object" && !Array.isArray(node) ? (node as { id?: unknown }).id : undefined
    if (typeof seg === "number" && typeof nodeId === "string") out += ` (id "${nodeId}")`
  }
  return out
}


export type SpecParseResult = { ok: true; spec: ParsedDiagramSpec } | { ok: false; error: string }


/** Validate an unknown value as a diagram spec, returning a readable, agent-fixable error on failure. */
export const parseDiagramSpec = (input: unknown): SpecParseResult => {
  const type = input && typeof input === "object" ? (input as { diagram_type?: unknown }).diagram_type : undefined
  if (typeof type !== "string" || !DIAGRAM_TYPES.includes(type as DiagramType)) {
    return {
      ok: false,
      error: `Invalid diagram spec: "diagram_type" must be one of ${DIAGRAM_TYPES.map((t) => `"${t}"`).join(", ")} (got ${JSON.stringify(type)}).`,
    }
  }
  const result = diagramSpecSchema.safeParse(input)
  if (!result.success) {
    const lines = result.error.issues.slice(0, 12).map((issue) => `- ${describePath(issue.path, input)}: ${issue.message}`)
    const more = result.error.issues.length > 12 ? `\n- …and ${result.error.issues.length - 12} more` : ""
    return { ok: false, error: `Invalid ${type} diagram spec:\n${lines.join("\n")}${more}` }
  }
  const problems = referenceProblems(result.data)
  if (problems.length > 0) {
    return { ok: false, error: `Invalid ${type} diagram spec:\n${problems.map((p) => `- ${p}`).join("\n")}` }
  }
  return { ok: true, spec: result.data }
}
