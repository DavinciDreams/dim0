// Timeline layout: card sizes, the importance → depth mapping that gives the
// "3D" look, and the stacking pass that places cards above the axis without
// overlap. Pure and DOM-free, so it runs in jsdom tests and on every zoom frame.
//
// Coordinates are stage pixels with y growing downward. Cards hang left-anchored
// on a stem at their event's x (Histropedia style). The more important a card, the
// nearer it is: larger, crisper, in front and placed first — so it gets the slots
// closest to the axis, while less important cards stack above it, smaller and
// hazier, and drop out entirely when there's no room left at this zoom.

import type { CardStyle } from "./model"


/** Design width of a card before its depth scale. */
export const CARD_WIDTH = 176
/** Where the stem meets the card, from its left edge (design px). */
export const STEM_INSET = 12
/** Minimum gap between placed cards (screen px). */
export const CARD_GAP = 6
/** Space between the lowest cards and their lane's baseline (screen px). */
export const MIN_STEM = 14
/** How much smaller a card is at the top of its lane than at the baseline (perspective). */
export const HEIGHT_SHRINK = 0.4

const TITLE_LINE = 16
const CHARS_PER_LINE = 21
const IMAGE_HEIGHT = 96


export interface CardShape {
  style: CardStyle
  title: string
  subtitle?: string
  description?: string
  hasImage: boolean
}


/** Lines a title takes at the card's width (estimated; the card clamps to match). */
export function titleLines(title: string, max = 3): number {
  const words = title.split(/\s+/).filter(Boolean)
  let lines = 1
  let used = 0
  for (const word of words) {
    const len = Math.min(word.length, CHARS_PER_LINE)
    if (used === 0) used = len
    else if (used + 1 + len <= CHARS_PER_LINE) used += 1 + len
    else {
      lines++
      used = len
    }
  }
  return Math.min(max, lines)
}


/** Lines of description a note card shows. */
export function noteLines(description: string | undefined): number {
  if (!description) return 0
  return Math.min(4, Math.ceil(description.length / 30))
}


/** The effective card style: an image card needs an image. */
export function effectiveStyle(shape: Pick<CardShape, "style" | "hasImage">): CardStyle {
  return shape.style === "image" && !shape.hasImage ? "classic" : shape.style
}


/** Design height (px, before depth scale) of a card — the view renders exactly this. */
export function cardHeight(shape: CardShape): number {
  const style = effectiveStyle(shape)
  const title = 12 + titleLines(shape.title) * TITLE_LINE
  const subtitle = shape.subtitle ? 20 : 0
  const date = 20
  switch (style) {
    case "image":
      return 140
    case "note":
      return title + subtitle + noteLines(shape.description) * 15 + (shape.description ? 6 : 0) + date + 4
    case "rounded":
      // p-1.5 + border-2 (16), image 88 + 6 gap.
      return (shape.hasImage ? IMAGE_HEIGHT - 2 : 0) + title + subtitle + date + 16
    case "classic":
    case "dark":
      return (shape.hasImage ? IMAGE_HEIGHT : 0) + title + subtitle + date
  }
}


export interface Depth {
  /** 0 = front (importance 5) … 1 = back (importance 1). */
  depth: number
  /** Size multiplier from depth. */
  scale: number
  /** Haze over the card (0 = none). */
  fog: number
}


/** Importance (1–5, default 3) → perspective depth: nearer cards are larger and clearer. */
export function depthFor(importance: number | undefined): Depth {
  const imp = importance === undefined || !Number.isFinite(importance) ? 3 : Math.min(5, Math.max(1, Math.round(importance)))
  const depth = (5 - imp) / 4
  return { depth, scale: 1 - 0.38 * depth, fog: 0.42 * depth }
}


export interface LayoutItem {
  id: string
  /** Stem x (stage px, any fixed origin — stacking is translation-invariant). */
  x: number
  importance?: number
  /** Design height (cardHeight). */
  height: number
  /** Lane index (0 when lanes are off). */
  lane: number
  /** Chronological position, the tie-break after importance. */
  order: number
}

export interface Lane {
  /** Highest y a card top may reach. */
  top: number
  /** Card bottoms rest at or above this y. */
  bottom: number
}

export interface PlacedCard {
  id: string
  x: number
  left: number
  top: number
  width: number
  height: number
  scale: number
  depth: number
  fog: number
  lane: number
  zIndex: number
}

export interface LayoutOptions {
  lanes: Lane[]
  /** Base size multiplier for the stage (small stages shrink every card). */
  baseScale: number
  /** An event that must be placed (keyboard focus / open details) — placed first. */
  pinnedId?: string | null
  /** Hard cap on placed cards (DOM budget). */
  maxCards?: number
}


interface Box {
  left: number
  right: number
  top: number
  bottom: number
}


/**
 * Place cards by priority (pinned, then importance, then chronology). Each card
 * takes the lowest free slot above its lane's baseline: candidate bottoms are the
 * baseline and the tops of already-placed cards it overlaps horizontally. Height
 * is depth too: the higher a card sits, the further back it reads — smaller and
 * hazier (HEIGHT_SHRINK at the lane's top), like objects receding toward a
 * horizon. A card that can't fit below its lane's top is left out (a dot only).
 */
export function layoutCards(items: LayoutItem[], options: LayoutOptions): Map<string, PlacedCard> {
  const { lanes, baseScale, pinnedId, maxCards = 400 } = options
  const sorted = [...items].sort((a, b) => {
    if (a.id === pinnedId) return -1
    if (b.id === pinnedId) return 1
    const ia = a.importance ?? 3
    const ib = b.importance ?? 3
    return ib - ia || a.order - b.order
  })
  const placedByLane = new Map<number, Box[]>()
  const out = new Map<string, PlacedCard>()
  for (const item of sorted) {
    if (out.size >= maxCards) break
    const lane = lanes[item.lane] ?? lanes[0]
    if (!lane || !Number.isFinite(item.x)) continue
    const { depth, scale: depthScale, fog } = depthFor(item.importance)
    const frontScale = depthScale * baseScale
    const frontLeft = item.x - STEM_INSET * frontScale
    const frontRight = frontLeft + CARD_WIDTH * frontScale
    const boxes = placedByLane.get(item.lane) ?? []
    // Every candidate box is at most the front box, so this is a superset of its neighbours.
    const nearby = boxes.filter((b) => b.left < frontRight + CARD_GAP && frontLeft < b.right + CARD_GAP)
    const baseline = lane.bottom - MIN_STEM
    const span = Math.max(1, baseline - lane.top)
    const candidates = [baseline, ...nearby.map((b) => b.top - CARD_GAP)].filter((c) => c <= baseline).sort((a, b) => b - a)
    let slot: { box: Box; scale: number; lift: number } | null = null
    for (const bottom of candidates) {
      const lift = Math.min(1, Math.max(0, (baseline - bottom) / span))
      const scale = frontScale * (1 - HEIGHT_SHRINK * lift)
      const left = item.x - STEM_INSET * scale
      const box: Box = { left, right: left + CARD_WIDTH * scale, top: bottom - item.height * scale, bottom }
      if (box.top < lane.top) continue
      const clear = nearby.every(
        (b) => box.right + CARD_GAP <= b.left || b.right + CARD_GAP <= box.left || box.top >= b.bottom + CARD_GAP || box.bottom + CARD_GAP <= b.top,
      )
      if (clear) {
        slot = { box, scale, lift }
        break
      }
    }
    if (!slot) continue
    const { box, scale, lift } = slot
    boxes.push(box)
    placedByLane.set(item.lane, boxes)
    const imp = item.importance ?? 3
    out.set(item.id, {
      id: item.id,
      x: item.x,
      left: box.left,
      top: box.top,
      width: box.right - box.left,
      height: box.bottom - box.top,
      scale,
      depth,
      fog: Math.min(0.6, fog + 0.28 * lift),
      lane: item.lane,
      zIndex: imp * 1000 + Math.max(0, Math.min(999, Math.round(box.bottom / 2))),
    })
  }
  return out
}


export interface Interval {
  id: string
  x1: number
  x2: number
}


/** Greedy row assignment for intervals (period bars, era bands); rows past `maxRows` share the last. */
export function assignRows(intervals: Interval[], maxRows: number, gap = 2): Map<string, number> {
  const ends: number[] = []
  const out = new Map<string, number>()
  for (const it of [...intervals].sort((a, b) => a.x1 - b.x1 || a.x2 - b.x2)) {
    let row = ends.findIndex((end) => end + gap <= it.x1)
    if (row < 0) row = ends.length < maxRows ? ends.length : maxRows - 1
    ends[row] = Math.max(ends[row] ?? -Infinity, it.x2)
    out.set(it.id, row)
  }
  return out
}


/** Split the card area into `count` equal lanes, bottom lane first. */
export function splitLanes(top: number, bottom: number, count: number): Lane[] {
  const n = Math.max(1, count)
  const h = (bottom - top) / n
  return Array.from({ length: n }, (_, i) => ({ top: bottom - (i + 1) * h + (i === n - 1 ? 0 : 6), bottom: bottom - i * h }))
}


/** Lanes from groups: 2–6 distinct groups get lanes (plus one for ungrouped events); otherwise none. */
export function laneGroups(groups: Array<string | undefined>): string[] | null {
  const distinct = [...new Set(groups.filter((g): g is string => !!g))]
  const hasUngrouped = groups.some((g) => !g)
  const count = distinct.length + (hasUngrouped ? 1 : 0)
  if (distinct.length < 2 || count > 6) return null
  return hasUngrouped ? [...distinct, ""] : distinct
}
