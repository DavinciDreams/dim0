// Which <Timeline> renderer a props object is for. Applets written before the
// picture timeline existed pass `events: [{ date, title, description? }]` and keep
// the simple vertical list; anything in the contract shape (dated `start`
// objects, a `table`, eras, a title, or the TimelineJS `data.events`) gets the
// zoomable timeline. Kept tiny and dependency-free so the dispatcher can decide
// without loading the timeline chunk.


function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}


/** True when the props are the old `{ events: [{ date, title }] }` list shape. */
export function isLegacyListProps(props: unknown): boolean {
  const p = isRecord(props) ? props : {}
  if (isRecord(p.table) || Array.isArray(p.eras) || typeof p.title === "string") return false
  if (isRecord(p.data) && Array.isArray(p.data.events)) return false // TimelineJS shape
  const events = Array.isArray(p.events) ? p.events : []
  return !events.some((e) => isRecord(e) && isRecord(e.start))
}
