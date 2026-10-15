// Timeline filtering (Histropedia's "article filtering"): category chips, a group
// choice, tag chips and a free-text search. Filtering only narrows the event list;
// the view re-runs the stacking layout on the result. Pure.

import type { TimelineEvent } from "./model"


export interface Facets {
  categories: string[]
  groups: string[]
  tags: string[]
}

export interface FilterState {
  /** Selected categories; empty = all. */
  categories: string[]
  /** Selected group; null = all. */
  group: string | null
  /** Selected tags (an event matches if it has any); empty = all. */
  tags: string[]
  query: string
}

export const EMPTY_FILTER: FilterState = { categories: [], group: null, tags: [], query: "" }

const MAX_TAG_FACETS = 40


/** The distinct categories, groups and tags (most used tags first, capped). */
export function facetsOf(events: TimelineEvent[]): Facets {
  const categories = new Set<string>()
  const groups = new Set<string>()
  const tagCounts = new Map<string, number>()
  for (const e of events) {
    if (e.category) categories.add(e.category)
    if (e.group) groups.add(e.group)
    for (const t of e.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  }
  const tags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_TAG_FACETS)
    .map(([t]) => t)
  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    groups: [...groups].sort((a, b) => a.localeCompare(b)),
    tags,
  }
}


/** True when there is anything to filter by (the filter bar is shown). */
export function hasFacets(facets: Facets, eventCount: number): boolean {
  return facets.categories.length > 1 || facets.groups.length > 1 || facets.tags.length > 0 || eventCount >= 12
}


export function isFiltering(f: FilterState): boolean {
  return f.categories.length > 0 || f.group !== null || f.tags.length > 0 || f.query.trim() !== ""
}


function matchesQuery(e: TimelineEvent, words: string[]): boolean {
  if (words.length === 0) return true
  const hay = [e.title, e.subtitle, e.description, e.category, e.group, e.dateLabel, ...e.tags]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
  return words.every((w) => hay.includes(w))
}


/** Events passing every active filter (order preserved). */
export function applyFilter(events: TimelineEvent[], f: FilterState): TimelineEvent[] {
  if (!isFiltering(f)) return events
  const cats = new Set(f.categories)
  const tags = new Set(f.tags)
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean)
  return events.filter(
    (e) =>
      (cats.size === 0 || (e.category !== undefined && cats.has(e.category))) &&
      (f.group === null || e.group === f.group) &&
      (tags.size === 0 || e.tags.some((t) => tags.has(t))) &&
      matchesQuery(e, words),
  )
}


/** Toggle `value` in a list (immutable). */
export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}
