// The applet <Timeline> picture timeline: a pannable, zoomable time axis with
// event cards hanging on stems, stacked by importance and drawn in perspective
// depth (important cards large and in front, the rest smaller and hazier behind).
// Periods are bars along the axis, eras shaded bands, groups optional lanes.
// Our own code (MIT, like the rest of the Generous-derived components) — no
// timeline library. DOM-rendered (cards, an SVG axis layer), so snapDOM captures
// it as-is; heavy logic lives in the pure modules beside this file.

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"

// Per-icon entries: the package barrel loads every icon (about 30 s under jsdom).
import { ArrowsOutLineHorizontalIcon } from "@phosphor-icons/react/dist/csr/ArrowsOutLineHorizontal"
import { MagnifyingGlassMinusIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlassMinus"
import { MagnifyingGlassPlusIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlassPlus"

import { useCaptureReady } from "@/lib/canvas/use-capture-ready"

import { cssColor, tint } from "./colors"
import { dateValue } from "./dates"
import { applyFilter, EMPTY_FILTER, facetsOf, hasFacets, type FilterState } from "./filter"
import { assignRows, cardHeight, laneGroups, layoutCards, splitLanes, type PlacedCard } from "./layout"
import { eraColor, eventColor, formatEventDate, formatTimelineDate, normalizeTimeline, type TimelineEra, type TimelineEvent, type TimelineModel } from "./model"
import { centerOn, clampView, fitView, limitsFor, panBy, spanLabel, ticks, xOf, zoomAt, type View } from "./scale"
import { HoverPreview, TimelineCard } from "./timeline-card"
import { DetailsPanel, FilterBar } from "./timeline-panels"
import { useInk } from "./use-ink"


/** Width used before the stage is measured (and in DOM-less tests). */
const FALLBACK_WIDTH = 800
const TICK_HEIGHT = 22
const ERA_ROW = 18
const PERIOD_ROW = 6
const IMAGE_WAIT_MS = 2500
const ZOOM_STEP = 1.6


/** Display text for an event's date: its own label, else the formatted range. */
function dateTextOf(event: TimelineEvent): string {
  return formatEventDate(event)
}


/** An era's extent in axis order (the contract does not require start ≤ end). */
function eraSpan(era: TimelineEra): [number, number] {
  const a = dateValue(era.start)
  const b = dateValue(era.end)
  return a <= b ? [a, b] : [b, a]
}


function eraRange(era: TimelineEra): string {
  const a = formatTimelineDate(era.start)
  const b = formatTimelineDate(era.end)
  return a === b ? a : `${a} – ${b}`
}


/** An era's shading: its colour (own or category's), else neutral, alternating so neighbours stay distinct. */
function eraFill(color: string | undefined, index: number, percent: number, base: string): string {
  if (color) return tint(color, percent, base)
  return `color-mix(in oklab, var(--muted-foreground) ${index % 2 === 0 ? Math.round(percent * 0.5) : Math.round(percent * 0.85)}%, ${base})`
}


function hasPeriod(event: TimelineEvent): boolean {
  return !!event.end && dateValue(event.end) > dateValue(event.start)
}


/** The applet `<Timeline>` (contract shape). Guards its props and renders the timeline. */
export function TimelineView(props: Record<string, unknown>) {
  // `data` / `options`: the legacy TimelineJS shape, accepted as Galaxy surfaces are.
  const { events, eras, table, title, height, data, options } = props
  const model = useMemo(() => normalizeTimeline({ events, eras, table, title, height, data, options }), [events, eras, table, title, height, data, options])
  if (model.events.length === 0 && model.eras.length === 0) {
    return (
      <div data-capture-ready="true" className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {model.title && <div className="mb-1 font-medium text-foreground">{model.title}</div>}
        No dated events to show.
      </div>
    )
  }
  const values = [...model.events.flatMap((e) => [dateValue(e.start), ...(e.end ? [dateValue(e.end)] : [])]), ...model.eras.flatMap((e) => [dateValue(e.start), dateValue(e.end)])]
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A new data extent starts from a fresh fitted view.
  return <TimelineStage key={`${min}:${max}`} model={model} min={min} max={max} />
}


interface StageProps {
  model: TimelineModel
  min: number
  max: number
}


function TimelineStage({ model, min, max }: StageProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const ink = useInk()

  // ---- size ----
  const [measured, setMeasured] = useState(0)
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    if (el.clientWidth > 0) setMeasured(el.clientWidth)
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setMeasured(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const width = measured > 0 ? measured : FALLBACK_WIDTH
  const H = model.height

  // ---- view (pan / zoom) ----
  const limits = useMemo(() => limitsFor(min, max), [min, max])
  const [view, setView] = useState<View>(() => fitView(min, max, limits))
  const widthRef = useRef(width)
  const limitsRef = useRef(limits)
  useEffect(() => {
    widthRef.current = width
    limitsRef.current = limits
  }, [width, limits])
  const queued = useRef<Array<(v: View) => View>>([])
  const frame = useRef<number | null>(null)
  /** Batch pointer / wheel updates to one state change per animation frame. */
  const queueView = useCallback((fn: (v: View) => View) => {
    if (typeof requestAnimationFrame !== "function") {
      setView(fn)
      return
    }
    queued.current.push(fn)
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const fns = queued.current
      queued.current = []
      setView((v) => fns.reduce((acc, f) => f(acc), v))
    })
  }, [])
  useEffect(
    () => () => {
      if (frame.current !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame.current)
    },
    [],
  )

  // ---- filtering, colours, lanes ----
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER)
  const facets = useMemo(() => facetsOf(model.events), [model.events])
  const filtered = useMemo(() => applyFilter(model.events, filter), [model.events, filter])
  const colors = model.colors
  const colorOf = useCallback((e: TimelineEvent): string => eventColor(e, colors), [colors])
  const laneKeys = useMemo(() => laneGroups(model.events.map((e) => e.group)), [model.events])

  // ---- vertical geometry ----
  const eraRows = useMemo(() => assignRows(model.eras.map((e, i) => ({ id: String(i), x1: eraSpan(e)[0], x2: eraSpan(e)[1] })), 2, 0), [model.eras])
  const eraRowCount = model.eras.length === 0 ? 0 : Math.max(...eraRows.values()) + 1
  const periods = useMemo(() => filtered.filter(hasPeriod), [filtered])
  const periodRows = useMemo(() => assignRows(periods.map((e) => ({ id: e.id, x1: dateValue(e.start), x2: dateValue(e.end!) })), 3, 0), [periods])
  const periodRowCount = periods.length === 0 ? 0 : Math.max(...periodRows.values()) + 1
  const eraStrip = eraRowCount * ERA_ROW + (eraRowCount ? 4 : 0)
  const axisY = H - eraStrip - TICK_HEIGHT
  const periodStrip = periodRowCount ? periodRowCount * PERIOD_ROW + 4 : 0
  const cardBottom = axisY - periodStrip - 2
  const cardTop = 8
  const laneCount = laneKeys?.length ?? 1
  const lanes = useMemo(() => splitLanes(cardTop, cardBottom, laneCount), [cardBottom, laneCount])

  // ---- images (a failed image drops from its card; capture waits for visible ones) ----
  const [images, setImages] = useState<ReadonlyMap<string, boolean>>(() => new Map())
  const onImageSettled = useCallback((url: string, ok: boolean) => {
    setImages((prev) => (prev.get(url) === ok ? prev : new Map(prev).set(url, ok)))
  }, [])
  const showImage = useCallback((e: TimelineEvent) => !!e.media && images.get(e.media.url) !== false, [images])

  // Design heights per event; a short stage (or many lanes) shrinks every card so the tallest still fits.
  const heights = useMemo(
    () => new Map(filtered.map((e) => [e.id, cardHeight({ style: e.style.card ?? "classic", title: e.title, subtitle: e.subtitle, description: e.description, hasImage: showImage(e) })])),
    [filtered, showImage],
  )
  const tallest = Math.max(60, ...heights.values())
  const baseScale = Math.min(1, Math.max(0.45, (cardBottom - cardTop) / laneCount / (tallest * 1.25)))

  // ---- interaction state ----
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [focusVisible, setFocusVisible] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const focusRequest = useRef<string | null>(null)
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  // Stable per-card callbacks, so a pan re-renders only each card's position.
  const refCallbacks = useRef(new Map<string, (el: HTMLButtonElement | null) => void>())
  const cardRef = useCallback((id: string) => {
    let cb = refCallbacks.current.get(id)
    if (!cb) {
      cb = (el) => {
        if (el) cardRefs.current.set(id, el)
        else cardRefs.current.delete(id)
      }
      refCallbacks.current.set(id, cb)
    }
    return cb
  }, [])
  const onFocusCard = useCallback((id: string) => {
    setFocusedId(id)
    setFocusVisible(true)
  }, [])
  const onBlurCard = useCallback(() => setFocusVisible(false), [])

  // ---- layout (re-run on zoom / filter / size; panning only shifts it) ----
  const refStart = min
  const pxPerYear = width / view.span
  const layout = useMemo(() => {
    const laneOf = new Map((laneKeys ?? []).map((k, i) => [k, i]))
    return layoutCards(
      filtered.map((e, order) => ({
        id: e.id,
        x: (dateValue(e.start) - refStart) * pxPerYear,
        importance: e.importance,
        height: heights.get(e.id) ?? 60,
        lane: laneKeys ? (laneOf.get(e.group ?? "") ?? 0) : 0,
        order,
      })),
      { lanes, baseScale, pinnedId },
    )
  }, [filtered, refStart, pxPerYear, laneKeys, lanes, baseScale, pinnedId, heights])
  const shift = (refStart - view.start) * pxPerYear

  const visible = useMemo(() => {
    const out: Array<{ event: TimelineEvent; placed: PlacedCard }> = []
    for (const event of filtered) {
      const placed = layout.get(event.id)
      if (!placed) continue
      const left = placed.left + shift
      if (left > width + 24 || left + placed.width < -24) continue
      out.push({ event, placed })
    }
    return out
  }, [filtered, layout, shift, width])
  const visibleIds = useMemo(() => new Set(visible.map((v) => v.event.id)), [visible])
  // Period bars and the dots of cards that don't fit at this zoom: up to 500 marks, so
  // they are drawn as one memoized layer in "pan bucket" coordinates and slid with a
  // transform. A pan re-renders the layer only when it crosses a bucket (one stage
  // width), keeping drag smooth with hundreds of events.
  const bucketBase = Math.floor(shift / width) * width
  const marksLayer = useMemo(() => {
    const at = (value: number) => (value - refStart) * pxPerYear + bucketBase
    const inReach = (x1: number, x2: number) => x2 >= -width - 8 && x1 <= width + 8
    return (
      <>
        {periods.map((e) => {
          const x1 = at(dateValue(e.start))
          const x2 = at(dateValue(e.end!))
          if (!inReach(x1, x2)) return null
          const row = periodRows.get(e.id) ?? 0
          const left = Math.max(-width - 8, x1)
          return (
            <rect
              key={`p${e.id}`}
              x={left}
              y={axisY - periodStrip + 2 + row * PERIOD_ROW}
              width={Math.max(2, Math.min(width + 8, x2) - left)}
              height={4}
              rx={2}
              style={{ fill: cssColor(colorOf(e)) }}
            />
          )
        })}
        {filtered.map((e) => {
          if (layout.has(e.id)) return null
          const x = at(dateValue(e.start))
          if (!inReach(x, x)) return null
          return <circle key={`h${e.id}`} cx={x} cy={axisY} r={2.5} style={{ fill: cssColor(colorOf(e)), opacity: 0.5 }} />
        })}
      </>
    )
  }, [periods, periodRows, filtered, layout, refStart, pxPerYear, bucketBase, width, axisY, periodStrip, colorOf])

  // Roving tab stop: the focused card if visible, else the leftmost visible card.
  const tabStop = focusedId && visibleIds.has(focusedId) ? focusedId : ([...visible].sort((a, b) => a.placed.left - b.placed.left)[0]?.event.id ?? null)

  useEffect(() => {
    const id = focusRequest.current
    if (!id) return
    const el = cardRefs.current.get(id)
    if (el) {
      focusRequest.current = null
      el.focus({ preventScroll: true })
    }
  })

  // ---- capture readiness ----
  const [imageWaitOver, setImageWaitOver] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setImageWaitOver(true), IMAGE_WAIT_MS)
    return () => clearTimeout(t)
  }, [])
  const pendingImages = visible.some(({ event }) => event.media && !images.has(event.media.url))
  const measuredOrHeadless = measured > 0 || typeof ResizeObserver === "undefined"
  useCaptureReady(rootRef, measuredOrHeadless && (!pendingImages || imageWaitOver))

  // ---- navigation ----
  const byId = useMemo(() => new Map(model.events.map((e) => [e.id, e])), [model.events])
  const indexIn = (id: string | null) => (id ? filtered.findIndex((e) => e.id === id) : -1)

  const goTo = useCallback(
    (event: TimelineEvent, focus: boolean) => {
      setFocusedId(event.id)
      setPinnedId(event.id)
      setView((v) => {
        const x = xOf(dateValue(event.start), v, width)
        return x < width * 0.06 || x > width * 0.7 ? centerOn(v, dateValue(event.start), limits) : v
      })
      if (focus) focusRequest.current = event.id
    },
    [width, limits],
  )

  const step = (delta: number, focus: boolean, from: string | null) => {
    if (filtered.length === 0) return
    let i = indexIn(from)
    if (i < 0) {
      // Start from the event nearest the middle of the view.
      const mid = view.start + view.span / 2
      i = filtered.reduce((best, e, j) => (Math.abs(dateValue(e.start) - mid) < Math.abs(dateValue(filtered[best].start) - mid) ? j : best), 0)
      delta = 0
    }
    const next = filtered[Math.max(0, Math.min(filtered.length - 1, i + delta))]
    goTo(next, focus)
    return next
  }

  const open = useCallback((id: string) => {
    setOpenId(id)
    setFocusedId(id)
    setPinnedId(id)
  }, [])

  const closeDetails = () => {
    if (openId) focusRequest.current = openId
    setOpenId(null)
  }

  const zoomCenter = (factor: number) => setView((v) => zoomAt(v, factor, width / 2, width, limits))
  const fit = () => setView(clampView(fitView(min, max, limits), limits))

  const onStageKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest("[data-timeline-panel]")) return
    const fromCard = (e.target as HTMLElement).dataset?.eventId ?? null
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        step(1, true, fromCard ?? focusedId)
        break
      case "ArrowLeft":
      case "ArrowUp":
        step(-1, true, fromCard ?? focusedId)
        break
      case "Enter":
        if (!fromCard) return
        open(fromCard)
        break
      case "Home":
        if (filtered[0]) goTo(filtered[0], true)
        break
      case "End":
        if (filtered.length) goTo(filtered[filtered.length - 1], true)
        break
      case "+":
      case "=":
        zoomCenter(1 / ZOOM_STEP)
        break
      case "-":
      case "_":
        zoomCenter(ZOOM_STEP)
        break
      default:
        return
    }
    e.preventDefault()
  }

  const onRootKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && openId) {
      e.preventDefault()
      e.stopPropagation()
      closeDetails()
    }
  }

  // ---- pointer: drag to pan, two-finger pinch, wheel zoom ----
  const pointers = useRef(new Map<number, number>())
  const drag = useRef<{ startX: number; lastX: number; moved: boolean; ratio: number; pinch: number | null }>({ startX: 0, lastX: 0, moved: false, ratio: 1, pinch: null })
  const suppressClick = useRef(false)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    pointers.current.set(e.pointerId, e.clientX)
    drag.current = { startX: e.clientX, lastX: e.clientX, moved: false, ratio: rect.width > 0 ? width / rect.width : 1, pinch: null }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      drag.current.pinch = Math.abs(a - b)
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, e.clientX)
    const d = drag.current
    const w = widthRef.current
    const lim = limitsRef.current
    if (pointers.current.size >= 2 && d.pinch !== null) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.abs(a - b)
      if (dist > 8 && d.pinch > 8) {
        const rect = e.currentTarget.getBoundingClientRect()
        const anchor = ((a + b) / 2 - rect.left) * d.ratio
        const factor = d.pinch / dist
        queueView((v) => zoomAt(v, factor, anchor, w, lim))
      }
      d.pinch = dist
      d.moved = true
      return
    }
    if (!d.moved && Math.abs(e.clientX - d.startX) > 4) {
      d.moved = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* capture is best-effort */
      }
    }
    if (d.moved) {
      const dx = (e.clientX - d.lastX) * d.ratio
      queueView((v) => panBy(v, dx, w, lim))
    }
    d.lastX = e.clientX
  }

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (drag.current.moved) suppressClick.current = true
    if (pointers.current.size < 2) drag.current.pinch = null
  }

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.stopPropagation()
      // The details panel scrolls natively.
      if (e.target instanceof Element && e.target.closest("[data-timeline-panel]")) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const w = widthRef.current
      const lim = limitsRef.current
      const ratio = rect.width > 0 ? w / rect.width : 1
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const dx = -e.deltaX * unit * ratio
        queueView((v) => panBy(v, dx, w, lim))
        return
      }
      const factor = Math.exp(Math.max(-200, Math.min(200, e.deltaY * unit)) * (e.ctrlKey ? 0.01 : 0.0018))
      const anchor = (e.clientX - rect.left) * ratio
      queueView((v) => zoomAt(v, factor, anchor, w, lim))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [queueView])

  // ---- render ----
  const tickList = useMemo(() => ticks(view, width), [view, width])
  const activeId = hoveredId ?? (focusVisible ? focusedId : null)
  const activeEntry = activeId ? visible.find((v) => v.event.id === activeId) : undefined
  const openEvent = openId ? byId.get(openId) : undefined
  const openIndex = indexIn(openId)
  const previewId = `${uid}-preview`
  const showFilters = hasFacets(facets, model.events.length)
  const hiddenCount = filtered.length - layout.size

  return (
    <div ref={rootRef} className="relative w-full select-none" onKeyDown={onRootKeyDown} data-slot="timeline">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {model.title && <div className="mr-auto text-sm font-semibold">{model.title}</div>}
        {!model.title && <span className="mr-auto" />}
        <span className="text-[11px] text-muted-foreground" aria-live="polite">
          {spanLabel(view.span)}
          {hiddenCount > 0 ? ` · ${hiddenCount} more — zoom in` : ""}
        </span>
        <div className="flex items-center rounded-md border bg-background">
          <button type="button" aria-label="Zoom in" onClick={() => zoomCenter(1 / ZOOM_STEP)} className="p-1.5 hover:bg-accent">
            <MagnifyingGlassPlusIcon className="size-4" />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomCenter(ZOOM_STEP)} className="border-x p-1.5 hover:bg-accent">
            <MagnifyingGlassMinusIcon className="size-4" />
          </button>
          <button type="button" aria-label="Fit all events" onClick={fit} className="p-1.5 hover:bg-accent">
            <ArrowsOutLineHorizontalIcon className="size-4" />
          </button>
        </div>
      </div>
      {showFilters && (
        <div className="mb-2">
          <FilterBar facets={facets} filter={filter} colors={colors} shown={filtered.length} total={model.events.length} onChange={setFilter} />
        </div>
      )}

      <div
        ref={stageRef}
        role="region"
        aria-roledescription="timeline"
        aria-label={`${model.title ?? "Timeline"}: drag to pan, scroll to zoom, arrow keys move between events, Enter opens details`}
        className="relative w-full cursor-grab touch-none overflow-hidden rounded-md border bg-background active:cursor-grabbing"
        style={{ height: H }}
        onKeyDown={onStageKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false
            e.preventDefault()
            e.stopPropagation()
          }
        }}
      >
        {/* Era tints across the stage. */}
        {model.eras.map((era, i) => {
          const [x1, x2] = eraSpan(era).map((v) => xOf(v, view, width))
          if (x2 < 0 || x1 > width) return null
          const color = eraColor(era, colors)
          const left = Math.max(-2, x1)
          return (
            <div key={`tint-${i}`} aria-hidden className="pointer-events-none absolute top-0" style={{ left, width: Math.max(1, Math.min(width + 2, x2) - left), height: axisY, background: eraFill(color, i, 7, "transparent") }} />
          )
        })}

        {/* Ground: a soft floor under the cards for the perspective look. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bg-gradient-to-b from-transparent to-muted/70" style={{ top: Math.max(0, cardBottom - 56), height: axisY - Math.max(0, cardBottom - 56) }} />

        {/* Lane bands. */}
        {laneKeys &&
          lanes.map((lane, i) => (
            <div key={`lane-${i}`} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/70" style={{ top: lane.top - 4, height: lane.bottom - lane.top }}>
              <span className="absolute top-0.5 left-1.5 rounded bg-background/80 px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{laneKeys[i] || "Other"}</span>
            </div>
          ))}

        <svg aria-hidden className="pointer-events-none absolute inset-0" width={width} height={H}>
          {tickList
            .filter((t) => t.major)
            .map((t) => {
              const x = xOf(t.value, view, width)
              return <line key={`g${t.value}`} x1={x} x2={x} y1={0} y2={axisY} style={{ stroke: "var(--border)", strokeDasharray: "2 4" }} />
            })}
          {visible.map(({ event, placed }) => {
            const x = placed.x + shift
            return (
              <line
                key={`s${event.id}`}
                x1={x}
                x2={x}
                y1={placed.top + placed.height - 2}
                y2={axisY}
                style={{ stroke: cssColor(colorOf(event)), strokeWidth: event.id === activeId ? 2.5 : 1.5, opacity: event.id === activeId ? 1 : 1 - placed.fog }}
              />
            )
          })}
          <g transform={`translate(${shift - bucketBase} 0)`}>{marksLayer}</g>
          {tickList.map((t) => {
            const x = xOf(t.value, view, width)
            if (x < -width || x > width * 2) return null
            const floorTop = Math.max(0, cardBottom - 56)
            const vx = width / 2 + (x - width / 2) * 0.7
            return <line key={`f${t.value}`} x1={x} x2={vx} y1={axisY} y2={floorTop} style={{ stroke: "var(--border)", strokeWidth: 1, opacity: 0.8 }} />
          })}
          <line x1={0} x2={width} y1={axisY} y2={axisY} style={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} />
          {tickList.map((t) => {
            const x = xOf(t.value, view, width)
            if (x < 0 || x > width) return null
            return (
              <g key={`t${t.value}`}>
                <line x1={x} x2={x} y1={axisY} y2={axisY + (t.major ? 6 : 4)} style={{ stroke: "var(--muted-foreground)" }} />
                <text x={x} y={axisY + 16} textAnchor={x < 48 ? "start" : x > width - 48 ? "end" : "middle"} style={{ fill: "var(--muted-foreground)", fontSize: 11, fontWeight: t.major ? 600 : 400 }}>
                  {t.label}
                </text>
              </g>
            )
          })}
          {visible.map(({ event, placed }) => (
            <circle key={`d${event.id}`} cx={placed.x + shift} cy={axisY} r={event.id === activeId ? 5 : 4} style={{ fill: cssColor(colorOf(event)), stroke: "var(--background)", strokeWidth: 1.5 }} />
          ))}
        </svg>

        {/* Era bands along the bottom. */}
        {model.eras.map((era, i) => {
          const [x1, x2] = eraSpan(era).map((v) => xOf(v, view, width))
          if (x2 < 0 || x1 > width) return null
          const color = eraColor(era, colors)
          const left = Math.max(-2, x1)
          const row = eraRows.get(String(i)) ?? 0
          return (
            <div
              key={`era-${i}`}
              className="absolute truncate rounded-sm px-1.5 text-[11px] leading-4 font-medium text-foreground"
              title={era.title}
              style={{ left, width: Math.max(1, Math.min(width + 2, x2) - left), top: axisY + TICK_HEIGHT + 2 + row * ERA_ROW, height: ERA_ROW - 2, background: eraFill(color, i, 26, "var(--background)"), borderLeft: `2px solid ${color ? cssColor(color) : "var(--muted-foreground)"}` }}
            >
              {era.title}
            </div>
          )
        })}

        {/* Cards. */}
        {visible.map(({ event, placed }) => {
          const color = colorOf(event)
          return (
            <TimelineCard
              key={event.id}
              event={event}
              placed={placed}
              left={placed.left + shift}
              top={placed.top}
              color={color}
              ink={ink(color)}
              dateText={dateTextOf(event)}
              active={event.id === activeId}
              selected={event.id === openId}
              tabbable={event.id === tabStop}
              showImage={showImage(event)}
              describedBy={event.id === activeId ? previewId : undefined}
              buttonRef={cardRef(event.id)}
              onHover={setHoveredId}
              onOpen={open}
              onFocusCard={onFocusCard}
              onBlurCard={onBlurCard}
              onImageSettled={onImageSettled}
            />
          )
        })}

        {activeEntry && !openId && (
          <HoverPreview
            id={previewId}
            event={activeEntry.event}
            dateText={dateTextOf(activeEntry.event)}
            color={colorOf(activeEntry.event)}
            box={{ left: activeEntry.placed.left + shift, top: activeEntry.placed.top, width: activeEntry.placed.width, height: activeEntry.placed.height }}
            stageWidth={width}
            stageHeight={H}
          />
        )}

        {filtered.length === 0 && model.events.length > 0 && (
          <div className="absolute inset-x-0 top-1/3 text-center text-sm text-muted-foreground">No events match the filters.</div>
        )}

        {openEvent && (
          <DetailsPanel
            event={openEvent}
            dateText={dateTextOf(openEvent)}
            color={colorOf(openEvent)}
            labelId={`${uid}-details`}
            hasPrev={openIndex > 0}
            hasNext={openIndex >= 0 && openIndex < filtered.length - 1}
            onPrev={() => {
              const e = step(-1, false, openId)
              if (e) setOpenId(e.id)
            }}
            onNext={() => {
              const e = step(1, false, openId)
              if (e) setOpenId(e.id)
            }}
            onClose={closeDetails}
          />
        )}
      </div>

      {/* Screen-reader fallback: every (filtered) event, in order. */}
      <EventList label={`${model.title ?? "Timeline"} events`} events={filtered} eras={model.eras} />
    </div>
  )
}


/** The accessible ordered-list fallback (memoized: it changes with the filter, not the view). */
const EventList = memo(function EventList({ label, events, eras }: { label: string; events: TimelineEvent[]; eras: TimelineModel["eras"] }) {
  return (
    <ol className="sr-only" aria-label={label}>
      {events.map((e) => (
        <li key={e.id}>
          {dateTextOf(e)}: {e.title}
          {e.subtitle ? ` — ${e.subtitle}` : ""}
          {e.description ? `. ${e.description}` : ""}
          {e.link && (
            <>
              {" "}
              <a href={e.link.url} target="_blank" rel="noopener noreferrer">
                {e.link.label ?? "Read more"}
              </a>
            </>
          )}
        </li>
      ))}
      {eras.map((era, i) => (
        <li key={`era-${i}`}>
          Era {era.title}: {eraRange(era)}
        </li>
      ))}
    </ol>
  )
})


export default TimelineView
