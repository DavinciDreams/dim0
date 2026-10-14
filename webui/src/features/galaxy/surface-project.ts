// Validate an untrusted gb.surface.v1 spec and project it into a component tree.
// Mirrors Galaxy Brain's `projectSurface` (lib/surface-projection.js) — the same
// approved types, forbidden keys/fragments and value bounds — but degrades per
// component instead of failing the whole surface: a component that is unknown or
// unsafe is dropped with a warning and its children are kept in its place, and
// broken links (unknown ids, second parents, cycles) are cut with a warning.
// Only a spec that is not a gb.surface.v1 document at all is refused outright.

import type { JsonValue } from "@/features/applet/tree"

import {
  SURFACE_BOUNDS,
  SURFACE_CATALOG,
  SURFACE_COMPONENT_TYPES,
  SURFACE_FORBIDDEN_FRAGMENTS,
  SURFACE_FORBIDDEN_KEYS,
  SURFACE_FORBIDDEN_KEY_PATTERN,
  SURFACE_IDENTIFIER,
  SURFACE_SCHEMA_ID,
  type SurfaceComponentType,
} from "./surface-types"


export type JsonObject = { [key: string]: JsonValue }


/** One projected component. `type` is null when it was unknown or unsafe (not drawn). */
export interface SurfaceNode {
  id: string
  type: SurfaceComponentType | null
  props: JsonObject
  children: SurfaceNode[]
}


export type SurfaceProjection = { ok: true; roots: SurfaceNode[] } | { ok: false; error: string }


const APPROVED_TYPES: ReadonlySet<string> = new Set(SURFACE_COMPONENT_TYPES)


type Bounded = { ok: true; value: JsonValue } | { ok: false; reason: string }


/**
 * Copy `value` as plain JSON while enforcing the contract's value bounds (depth,
 * node count, string length, forbidden keys and fragments, finite numbers).
 * Returns the copy, or the first reason it is out of bounds.
 */
export function boundedJson(value: unknown, depth = 0, counter = { n: 0 }): Bounded {
  counter.n += 1
  if (depth > SURFACE_BOUNDS.maxDepth) return { ok: false, reason: "nested too deeply" }
  if (counter.n > SURFACE_BOUNDS.maxValueNodes) return { ok: false, reason: "too many values" }
  if (value === null || typeof value === "boolean") return { ok: true, value }
  if (typeof value === "number") return Number.isFinite(value) ? { ok: true, value } : { ok: false, reason: "a non-finite number" }
  if (typeof value === "string") {
    if (value.length > SURFACE_BOUNDS.maxStringLength) return { ok: false, reason: "a string over the length bound" }
    const lower = value.toLowerCase()
    const fragment = SURFACE_FORBIDDEN_FRAGMENTS.find((f) => lower.includes(f))
    return fragment ? { ok: false, reason: `a forbidden fragment (${fragment})` } : { ok: true, value }
  }
  if (Array.isArray(value)) {
    const out: JsonValue[] = []
    for (const item of value) {
      const r = boundedJson(item, depth + 1, counter)
      if (!r.ok) return r
      out.push(r.value)
    }
    return { ok: true, value: out }
  }
  if (typeof value !== "object" || !isPlainObject(value)) return { ok: false, reason: "an unsupported value" }
  const out: JsonObject = {}
  for (const [key, item] of Object.entries(value)) {
    if (SURFACE_FORBIDDEN_KEYS.has(key) || SURFACE_FORBIDDEN_KEY_PATTERN.test(key)) {
      return { ok: false, reason: `a forbidden property (${key.slice(0, 40)})` }
    }
    const r = boundedJson(item, depth + 1, counter)
    if (!r.ok) return r
    out[key] = r.value
  }
  return { ok: true, value: out }
}


/** UTF-8 size of the spec's JSON, or null when it cannot be serialized. Stops early when clearly over. */
function jsonBytes(spec: unknown): number | null {
  let json: string
  try {
    json = JSON.stringify(spec)
  } catch {
    return null
  }
  // UTF-8 never takes fewer bytes than UTF-16 code units, so a long string is over.
  if (json.length > SURFACE_BOUNDS.maxJsonBytes) return json.length
  return new TextEncoder().encode(json).length
}


/** A short, printable form of an untrusted id for warnings. */
export function shown(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value.slice(0, 64)) : typeof value
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}


/** A JSON-like object (plain or null-prototype), not a Date / Map / class instance. */
function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}


/** Check the document envelope (schema, catalog, size). Returns an error message or null. */
function envelopeError(spec: unknown): string | null {
  if (!isRecord(spec)) return "the surface spec is not an object"
  if (spec.schema !== SURFACE_SCHEMA_ID) return `unsupported surface schema ${shown(spec.schema)}`
  const catalog = spec.catalog
  if (!isRecord(catalog) || catalog.id !== SURFACE_CATALOG.id || catalog.version !== SURFACE_CATALOG.version) {
    return "unsupported component catalog"
  }
  const bytes = jsonBytes(spec)
  if (bytes === null) return "the surface spec is not serializable JSON"
  if (bytes > SURFACE_BOUNDS.maxJsonBytes) return `the surface spec is ${bytes} bytes (limit ${SURFACE_BOUNDS.maxJsonBytes})`
  const update = spec.surfaceUpdate
  if (!isRecord(update) || !Array.isArray(update.components) || update.components.length === 0) {
    return "the surface has no components"
  }
  return null
}


interface Draft {
  node: SurfaceNode
  childIds: string[]
  parentId?: unknown
  children?: unknown
}


/** Read one raw component into a draft node, or null (with a warning) when it can't be identified. */
function readComponent(raw: unknown, index: number, warnings: string[]): Draft | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !SURFACE_IDENTIFIER.test(raw.id)) {
    warnings.push(`component #${index + 1} has no valid id and was skipped`)
    return null
  }
  const id = raw.id
  const entries = isRecord(raw.component) ? Object.entries(raw.component) : []
  let type: SurfaceComponentType | null = null
  let props: JsonObject = {}
  if (entries.length !== 1) {
    warnings.push(`component ${shown(id)} must name exactly one type; it was not drawn`)
  } else if (!APPROVED_TYPES.has(entries[0][0])) {
    warnings.push(`component ${shown(id)} has unknown type ${shown(entries[0][0])}; it was not drawn`)
  } else if (!isRecord(entries[0][1])) {
    warnings.push(`component ${shown(id)} has invalid properties; it was not drawn`)
  } else {
    const bounded = boundedJson(entries[0][1])
    if (bounded.ok) {
      type = entries[0][0] as SurfaceComponentType
      props = bounded.value as JsonObject
    } else {
      warnings.push(`component ${shown(id)} (${entries[0][0]}) has ${bounded.reason}; it was not drawn`)
    }
  }
  return { node: { id, type, props, children: [] }, childIds: [], parentId: raw.parentId, children: raw.children }
}


/**
 * Validate `spec` and build its component tree (roots in component order, children
 * from `children` lists first, then `parentId` links). Never throws.
 */
export function projectSurfaceSpec(spec: unknown, warnings: string[]): SurfaceProjection {
  const error = envelopeError(spec)
  if (error) return { ok: false, error }
  const record = spec as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!["schema", "catalog", "surfaceUpdate", "bindings"].includes(key)) warnings.push(`ignored top-level property ${shown(key)}`)
  }
  if (Array.isArray(record.bindings) && record.bindings.length > SURFACE_BOUNDS.maxBindings) {
    warnings.push(`the surface declares ${record.bindings.length} bindings (limit ${SURFACE_BOUNDS.maxBindings}); they are not used on import`)
  }

  let components = (record.surfaceUpdate as { components: unknown[] }).components
  if (components.length > SURFACE_BOUNDS.maxComponents) {
    warnings.push(`the surface has ${components.length} components; only the first ${SURFACE_BOUNDS.maxComponents} were imported`)
    components = components.slice(0, SURFACE_BOUNDS.maxComponents)
  }

  const drafts = new Map<string, Draft>()
  const order: string[] = []
  components.forEach((raw, index) => {
    const draft = readComponent(raw, index, warnings)
    if (!draft) return
    if (drafts.has(draft.node.id)) {
      warnings.push(`duplicate component id ${shown(draft.node.id)}; the later one was skipped`)
      return
    }
    drafts.set(draft.node.id, draft)
    order.push(draft.node.id)
  })

  const parentOf = linkParents(drafts, order, warnings)
  const roots = buildTree(drafts, order, parentOf, warnings)
  return { ok: true, roots }
}


/** Resolve each component's parent from `children` lists, then `parentId`; fill childIds. */
function linkParents(drafts: Map<string, Draft>, order: string[], warnings: string[]): Map<string, string> {
  const parentOf = new Map<string, string>()
  for (const id of order) {
    const draft = drafts.get(id)!
    if (draft.children === undefined) continue
    if (!Array.isArray(draft.children)) {
      warnings.push(`component ${shown(id)} has invalid children; they were ignored`)
      continue
    }
    for (const childId of draft.children) {
      if (typeof childId !== "string" || !drafts.has(childId) || childId === id) {
        warnings.push(`component ${shown(id)} lists unknown child ${shown(childId)}`)
        continue
      }
      const existing = parentOf.get(childId)
      if (existing !== undefined) {
        if (existing !== id) warnings.push(`component ${shown(childId)} has more than one parent; kept under ${shown(existing)}`)
        continue
      }
      parentOf.set(childId, id)
      draft.childIds.push(childId)
    }
  }
  for (const id of order) {
    const draft = drafts.get(id)!
    if (draft.parentId === undefined) continue
    const parentId = draft.parentId
    if (typeof parentId !== "string" || !drafts.has(parentId) || parentId === id) {
      warnings.push(`component ${shown(id)} names unknown parent ${shown(parentId)}; shown at the top level`)
      continue
    }
    const existing = parentOf.get(id)
    if (existing !== undefined) {
      if (existing !== parentId) warnings.push(`component ${shown(id)} has more than one parent; kept under ${shown(existing)}`)
      continue
    }
    parentOf.set(id, parentId)
    drafts.get(parentId)!.childIds.push(id)
  }
  return parentOf
}


/** Build the tree from the roots, cutting cycles; components only reachable through a cycle are dropped. */
function buildTree(drafts: Map<string, Draft>, order: string[], parentOf: Map<string, string>, warnings: string[]): SurfaceNode[] {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const build = (id: string): SurfaceNode | null => {
    if (visiting.has(id) || visited.has(id)) {
      warnings.push(`component ${shown(id)} is part of a cycle; the cycle was cut`)
      return null
    }
    visiting.add(id)
    const draft = drafts.get(id)!
    draft.node.children = draft.childIds.map(build).filter((n): n is SurfaceNode => n !== null)
    visiting.delete(id)
    visited.add(id)
    return draft.node
  }
  const roots = order
    .filter((id) => !parentOf.has(id))
    .map(build)
    .filter((n): n is SurfaceNode => n !== null)
  const unreachable = order.filter((id) => !visited.has(id))
  if (unreachable.length > 0) {
    warnings.push(`${unreachable.length} component(s) were only reachable through a cycle and were skipped`)
  }
  return roots
}
