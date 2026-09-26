// The applet <JsonViewer> component. Adapted from Generous (MIT): a collapsible,
// read-only tree over plain JSON data.

import { useState } from "react"

import { cn } from "@/lib/utils"

import type { JsonViewerProps } from "./types"


// Children rendered per object/array level before a "… N more" stub.
const MAX_CHILDREN = 200


/** One value in the tree: primitives inline, objects/arrays as a toggleable branch. */
function JsonNode({ name, value, depth, expandDepth }: { name?: string; value: unknown; depth: number; expandDepth: number }) {
  const [open, setOpen] = useState(depth < expandDepth)
  const label = name !== undefined ? <span className="text-muted-foreground">{name}: </span> : null

  if (value === null || typeof value !== "object") {
    return (
      <div className="whitespace-pre-wrap break-all">
        {label}
        <Primitive value={value} />
      </div>
    )
  }

  const isArray = Array.isArray(value)
  const entries = isArray ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>)
  const [openBrace, closeBrace] = isArray ? ["[", "]"] : ["{", "}"]
  return (
    <div>
      <button type="button" className="text-left hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="inline-block w-3 text-muted-foreground">{open ? "▾" : "▸"}</span>
        {label}
        {openBrace}
        {!open && <span className="text-muted-foreground"> {entries.length} {isArray ? "items" : "keys"} </span>}
        {!open && closeBrace}
      </button>
      {open && (
        <div className="border-l border-border pl-3">
          {entries.slice(0, MAX_CHILDREN).map(([k, v]) => (
            <JsonNode key={k} name={isArray ? undefined : k} value={v} depth={depth + 1} expandDepth={expandDepth} />
          ))}
          {entries.length > MAX_CHILDREN && <div className="text-muted-foreground">… {entries.length - MAX_CHILDREN} more</div>}
        </div>
      )}
      {open && <div>{closeBrace}</div>}
    </div>
  )
}


/** A leaf value, colored by JSON type. */
function Primitive({ value }: { value: unknown }) {
  if (typeof value === "string") return <span className="text-chart-2">"{value}"</span>
  if (typeof value === "number") return <span className="text-chart-1">{value}</span>
  if (typeof value === "boolean") return <span className="text-chart-4">{String(value)}</span>
  return <span className="text-muted-foreground">null</span>
}


/** Render `data` as a collapsible JSON tree, expanded to `expandDepth` levels. */
export function JsonViewer({ data, expandDepth = 1 }: JsonViewerProps) {
  const depth = typeof expandDepth === "number" && expandDepth >= 0 ? expandDepth : 1
  return (
    <div className={cn("overflow-auto rounded-md bg-muted/40 p-2 font-mono text-xs leading-5")}>
      <JsonNode value={data} depth={0} expandDepth={depth} />
    </div>
  )
}
