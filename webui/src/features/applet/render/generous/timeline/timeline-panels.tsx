// The timeline's detail panel (opened by clicking a card) and its filter bar.
// Plain text only; the one link is http(s) (checked by the model) and opens in a
// new tab without an opener.

import { memo, useEffect, useRef } from "react"

// Per-icon entries: the package barrel loads every icon (about 30 s under jsdom).
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/csr/ArrowSquareOut"
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft"
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight"
import { XIcon } from "@phosphor-icons/react/dist/csr/X"

import { cn } from "@/lib/utils"

import { cssColor } from "./colors"
import { isFiltering, toggle, type Facets, type FilterState } from "./filter"
import type { TimelineEvent } from "./model"


export interface DetailsPanelProps {
  event: TimelineEvent
  dateText: string
  color: string
  labelId: string
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}


/** Full details for one event: large image, title, date, description, credit, read-more link. */
export function DetailsPanel({ event, dateText, color, labelId, hasPrev, hasNext, onPrev, onNext, onClose }: DetailsPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [event.id])
  const media = event.media
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={labelId}
      className="absolute inset-y-2 right-2 z-[300000] flex w-[min(380px,calc(100%-16px))] cursor-auto flex-col overflow-hidden select-text rounded-lg border bg-popover text-popover-foreground shadow-2xl"
      data-timeline-panel=""
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="h-1.5 shrink-0" style={{ background: cssColor(color) }} />
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <button type="button" aria-label="Previous event" disabled={!hasPrev} onClick={onPrev} className="rounded p-1 hover:bg-accent disabled:opacity-40">
          <CaretLeftIcon className="size-4" />
        </button>
        <button type="button" aria-label="Next event" disabled={!hasNext} onClick={onNext} className="rounded p-1 hover:bg-accent disabled:opacity-40">
          <CaretRightIcon className="size-4" />
        </button>
        <span className="flex-1" />
        <button ref={closeRef} type="button" aria-label="Close details" onClick={onClose} className="rounded p-1 hover:bg-accent">
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {media && (
          <figure className="m-0">
            <img
              src={media.url}
              alt={media.alt ?? event.title}
              referrerPolicy="no-referrer"
              decoding="async"
              className="block max-h-64 w-full bg-muted object-contain"
            />
            {(media.caption || media.credit) && (
              <figcaption className="px-3 pt-1.5 text-[11px] leading-4 text-muted-foreground">
                {media.caption}
                {media.caption && media.credit ? " · " : ""}
                {media.credit && <span className="italic">{media.credit}</span>}
              </figcaption>
            )}
          </figure>
        )}
        <div className="space-y-2 p-3">
          <div>
            <h3 id={labelId} className="text-base leading-6 font-semibold">
              {event.title}
            </h3>
            {event.subtitle && <div className="text-sm text-muted-foreground">{event.subtitle}</div>}
            <div className="text-xs text-muted-foreground">{dateText}</div>
          </div>
          {(event.category || event.group || event.tags.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {event.category && (
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: cssColor(color) }} />
                  {event.category}
                </span>
              )}
              {event.group && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{event.group}</span>}
              {event.tags.map((t) => (
                <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                  #{t}
                </span>
              ))}
            </div>
          )}
          {event.description && <p className="text-sm leading-6 whitespace-pre-line">{event.description}</p>}
          {event.link && (
            <a
              href={event.link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {event.link.label ?? "Read more"}
              <ArrowSquareOutIcon className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}


export interface FilterBarProps {
  facets: Facets
  filter: FilterState
  colors: Map<string, string>
  shown: number
  total: number
  onChange: (next: FilterState) => void
}


const CHIP = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors"


/** Category chips (in their card colours), a group choice, tag chips and a search box. */
export const FilterBar = memo(function FilterBar({ facets, filter, colors, shown, total, onChange }: FilterBarProps) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filter, ...patch })
  return (
    <div role="group" aria-label="Filter events" className="flex flex-wrap items-center gap-1.5 text-xs">
      <input
        type="search"
        value={filter.query}
        placeholder="Search events"
        aria-label="Search events"
        onChange={(e) => set({ query: e.target.value })}
        className="h-7 w-40 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {facets.groups.length > 1 && (
        <select
          aria-label="Group"
          value={filter.group ?? ""}
          onChange={(e) => set({ group: e.target.value === "" ? null : e.target.value })}
          className="h-7 rounded-md border bg-background px-1.5 text-xs"
        >
          <option value="">All groups</option>
          {facets.groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      )}
      {facets.categories.length > 1 &&
        facets.categories.map((c) => {
          const on = filter.categories.includes(c)
          const token = colors.get(c) ?? "primary"
          return (
            <button
              key={`c:${c}`}
              type="button"
              aria-pressed={on}
              onClick={() => set({ categories: toggle(filter.categories, c) })}
              className={cn(CHIP, on ? "bg-accent text-accent-foreground" : "bg-background hover:bg-accent/60")}
              style={{ borderColor: cssColor(token) }}
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: cssColor(token) }} />
              {c}
            </button>
          )
        })}
      {facets.tags.map((t) => {
        const on = filter.tags.includes(t)
        return (
          <button
            key={`t:${t}`}
            type="button"
            aria-pressed={on}
            onClick={() => set({ tags: toggle(filter.tags, t) })}
            className={cn(CHIP, on ? "border-ring bg-secondary text-secondary-foreground" : "bg-background text-muted-foreground hover:bg-accent/60")}
          >
            #{t}
          </button>
        )
      })}
      {isFiltering(filter) && (
        <>
          <span className="text-muted-foreground" aria-live="polite">
            {shown} of {total}
          </span>
          <button type="button" onClick={() => onChange({ categories: [], group: null, tags: [], query: "" })} className="text-primary underline-offset-2 hover:underline">
            Clear
          </button>
        </>
      )}
    </div>
  )
})
