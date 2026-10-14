// The applet <Table> component (applet-design.md §7). A themed, optionally
// sortable data table driven by plain `columns` + `rows` data — so the agent
// supplies data, not table markup. Registered as `Table` in the applet renderer.
// The optional display props (title, align, striped, compact, bordered, pageSize,
// cellFormat) cover the Generous / gb.surface.v1 DataTable options; every one is
// additive, so an existing `<Table columns rows sortable>` renders as before.

import { useMemo, useState } from "react"

import { cn } from "@/lib/utils"

import { formatReadableCell } from "./table-format"


type Align = "left" | "center" | "right"
type Column = string | { key: string; label?: string; align?: Align }
type Row = Record<string, unknown>


interface TableProps {
  columns: Column[]
  rows: Row[]
  sortable?: boolean
  /** Heading shown above the table. */
  title?: string
  striped?: boolean
  compact?: boolean
  /** Draw cell borders (a grid), not just row rules. */
  bordered?: boolean
  /** Show this many rows per page with prev/next controls (1–500). */
  pageSize?: number
  /** "readable": "—" for empty, Yes/No, joined lists and records. Default "plain". */
  cellFormat?: "plain" | "readable"
  /** Shown in place of the body when there are no rows. */
  emptyText?: string
  className?: string
}


const ALIGN_CLASS: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}


/** Normalize a column (string shorthand or object) to a { key, label, align } triple. */
function normalize(col: Column): { key: string; label: string; align?: Align } | null {
  if (typeof col === "string") return { key: col, label: col }
  if (!col || typeof col !== "object" || typeof col.key !== "string") return null
  const align = typeof col.align === "string" && col.align in ALIGN_CLASS ? col.align : undefined
  return { key: col.key, label: typeof col.label === "string" ? col.label : col.key, align }
}


/** A total order over cell values: nullish sorts first, numbers numerically,
 *  everything else by string — so mixed/missing cells sort consistently. */
function compareCells(x: unknown, y: unknown): number {
  if (x === y) return 0
  if (x === null || x === undefined) return y === null || y === undefined ? 0 : -1
  if (y === null || y === undefined) return 1
  if (typeof x === "number" && typeof y === "number") return x - y
  const sx = String(x)
  const sy = String(y)
  return sx < sy ? -1 : sx > sy ? 1 : 0
}


/** A sane page size, or undefined (no pagination). */
function pageSizeOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 500 ? value : undefined
}


/** Render a data table; when `sortable`, clicking a header sorts by that column. */
export function Table({
  columns,
  rows,
  sortable,
  title,
  striped,
  compact,
  bordered,
  pageSize,
  cellFormat,
  emptyText,
  className,
}: TableProps) {
  // Guard against non-array bindings (e.g. `rows` evaluating to an object) and
  // non-object entries — degrade to an empty table rather than throwing.
  const cols = useMemo(
    () => (Array.isArray(columns) ? columns : []).map(normalize).filter((c) => c !== null),
    [columns],
  )
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null)
  const [page, setPage] = useState(0)
  const size = pageSizeOf(pageSize)
  const readable = cellFormat === "readable"

  const sorted = useMemo(() => {
    const base = (Array.isArray(rows) ? rows : []).filter((r): r is Row => r !== null && typeof r === "object")
    if (!sort) return base
    const dir = sort.asc ? 1 : -1
    return [...base].sort((a, b) => compareCells(a[sort.key], b[sort.key]) * dir)
  }, [rows, sort])

  const pages = size ? Math.max(1, Math.ceil(sorted.length / size)) : 1
  const current = Math.min(page, pages - 1)
  const visible = size ? sorted.slice(current * size, current * size + size) : sorted

  const onHeader = (key: string): void => {
    if (!sortable) return
    setSort((prev) => (prev && prev.key === key ? { key, asc: !prev.asc } : { key, asc: true }))
  }

  const cellPad = compact ? "px-2 py-0.5" : "px-2 py-1"
  const cellText = (value: unknown): string => (readable ? formatReadableCell(value) : String(value ?? ""))

  return (
    <div className={cn("overflow-x-auto", className)}>
      {typeof title === "string" && title.trim() ? <div className="mb-2 text-sm font-semibold">{title}</div> : null}
      <table className={cn("w-full text-sm", bordered && "border")}>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {cols.map((c) => (
              <th
                key={c.key}
                onClick={() => onHeader(c.key)}
                className={cn(
                  cellPad,
                  "font-medium",
                  c.align && ALIGN_CLASS[c.align],
                  bordered && "border",
                  sortable && "cursor-pointer select-none",
                )}
              >
                {c.label}
                {sort?.key === c.key ? (sort.asc ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr key={i} className={cn("border-b last:border-0", striped && "even:bg-muted/50")}>
              {cols.map((c) => (
                <td key={c.key} className={cn(cellPad, "align-top", c.align && ALIGN_CLASS[c.align], bordered && "border")}>
                  {cellText(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && typeof emptyText === "string" && emptyText ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : null}
      {size && pages > 1 ? (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            className="rounded-md border px-2 py-0.5 disabled:opacity-50"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Prev
          </button>
          <span className="tabular-nums">
            {current + 1} / {pages}
          </span>
          <button
            type="button"
            className="rounded-md border px-2 py-0.5 disabled:opacity-50"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}
