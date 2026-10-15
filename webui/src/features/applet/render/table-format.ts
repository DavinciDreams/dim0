// Readable cell formatting for the applet <Table cellFormat="readable">. Ported
// from Galaxy Brain's `formatSurfaceCell` (lib/surface-render-data.js) so an
// imported gb.surface.v1 DataTable shows structured values the same way there and
// here: projected to display text, never parsed or executed as rich content.


/** `snake_case` / `camelCase` keys as a human label ("Created at"). */
function humanizeKey(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/^./, (character) => character.toUpperCase())
}


/** Format one bounded cell value as display text ("—" for empty, "Yes"/"No", joined lists). */
export function formatReadableCell(value: unknown, depth = 0): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (depth >= 2) return "Structured value"
  if (Array.isArray(value)) {
    if (value.length === 0) return "—"
    const visible = value.slice(0, 8).map((item) => formatReadableCell(item, depth + 1))
    if (value.length > visible.length) visible.push(`+${value.length - visible.length} more`)
    return visible.join(" · ")
  }
  if (typeof value !== "object") return "—"

  const record = value as Record<string, unknown>
  const entries = Object.entries(record).slice(0, 8)
  if (entries.length === 0) return "—"
  const preferred = ["label", "title", "name", "value", "text", "id"].find((key) => Object.hasOwn(record, key))
  if (preferred && entries.length === 1) return formatReadableCell(record[preferred], depth + 1)
  const visible = entries.map(([key, item]) => `${humanizeKey(key)}: ${formatReadableCell(item, depth + 1)}`)
  const total = Object.keys(record).length
  if (total > visible.length) visible.push(`+${total - visible.length} fields`)
  return visible.join(" · ")
}
