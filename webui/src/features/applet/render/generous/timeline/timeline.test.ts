import { describe, expect, it } from "vitest"

import { categoryColors, contrastRatio, cssColor, hexInk, inkFor, parseCssColor, relativeLuminance } from "./colors"
import { dateValue, formatYear } from "./dates"
import { applyFilter, EMPTY_FILTER, facetsOf, hasFacets } from "./filter"
import { assignRows, cardHeight, CARD_GAP, depthFor, laneGroups, layoutCards, MIN_STEM, splitLanes, type LayoutItem } from "./layout"
import { eraColor, eventColor, normalizeTimeline } from "./model"
import { clampView, fitView, formatTickYear, limitsFor, panBy, spanLabel, ticks, tickUnit, valueAt, xOf, zoomAt } from "./scale"
import { isLegacyListProps } from "./shape"


describe("time scale", () => {
  const limits = limitsFor(1800, 2000)

  it("maps dates to a linear fractional year and formats tick years", () => {
    expect(dateValue({ year: 2000 })).toBe(2000)
    expect(dateValue({ year: 2000, month: 1, day: 1 })).toBe(2000)
    expect(dateValue({ year: 2000, month: 7, day: 2 })).toBeCloseTo(2000 + 182 / 365, 10)
    expect(dateValue({ year: 2000, month: 12, day: 31 })).toBeLessThan(2001)
    expect(formatYear(-12000)).toBe("12,000 BCE")
    expect(formatYear(-4_540_000_000)).toBe("4.54 billion years ago")
  })

  it("converts between time and pixels", () => {
    const view = { start: 1800, span: 200 }
    expect(xOf(1900, view, 1000)).toBe(500)
    expect(valueAt(250, view, 1000)).toBe(1850)
  })

  it("zooms anchored at the pointer and clamps", () => {
    const view = { start: 1800, span: 200 }
    const zoomed = zoomAt(view, 0.5, 250, 1000, limits)
    expect(zoomed.span).toBe(100)
    expect(valueAt(250, zoomed, 1000)).toBeCloseTo(1850, 9)
    expect(zoomAt(view, 1e-9, 0, 1000, limits).span).toBe(limits.minSpan)
    expect(zoomAt(view, 1e9, 0, 1000, limits).span).toBe(limits.maxSpan)
  })

  it("pans by pixels but keeps the data in reach", () => {
    const view = { start: 1800, span: 200 }
    expect(panBy(view, 100, 1000, limits).start).toBe(1780)
    expect(panBy(view, -1e7, 1000, limits).start).toBeLessThanOrEqual(2000)
    expect(clampView({ start: NaN, span: NaN }, limits)).toEqual({ start: expect.any(Number), span: limits.maxSpan })
  })

  it("fits the data with padding", () => {
    const fit = fitView(1800, 2000, limits)
    expect(fit.start).toBeLessThan(1800)
    expect(fit.start + fit.span).toBeGreaterThan(2000)
    const single = fitView(1900, 1900, limitsFor(1900, 1900))
    expect(single.span).toBeGreaterThan(0)
  })

  it("adapts tick units from billions of years down to days", () => {
    expect(tickUnit({ start: 1800, span: 200 }, 1000)).toEqual({ kind: "year", n: 20 })
    expect(tickUnit({ start: 2024, span: 1 }, 1000)).toEqual({ kind: "month", n: 1 })
    expect(tickUnit({ start: 2024, span: 10 / 365 }, 1000)).toEqual({ kind: "day", n: 1 })
    const deep = tickUnit({ start: -14e9, span: 14e9 }, 1000)
    expect(deep.kind).toBe("year")
    expect(deep.n).toBeGreaterThanOrEqual(1e9)
  })

  it("labels ticks in calendar, BCE and deep-time terms", () => {
    const months = ticks({ start: 2024, span: 1 }, 1000)
    expect(months.map((t) => t.label)).toContain("Jun 2024")
    expect(months.find((t) => t.label === "2024")?.major).toBe(true)
    const days = ticks({ start: 2024 + 59 / 365, span: 10 / 365 }, 1000)
    expect(days.map((t) => t.label)).toContain("5 Mar")
    expect(days.map((t) => t.label)).toContain("Mar 2024")
    const bce = ticks({ start: -1000, span: 1000 }, 1000).map((t) => t.label)
    expect(bce).toContain("500 BCE")
    const deep = ticks({ start: -14e9, span: 14e9 }, 1000).map((t) => t.label)
    expect(deep.some((l) => /billion years ago$/.test(l))).toBe(true)
    expect(formatTickYear(-66_000_000, 1e6)).toBe("66 million years ago")
    expect(formatTickYear(-500_000, 1e5)).toBe("0.5 million years ago")
    expect(formatTickYear(1900, 100)).toBe("1900")
    expect(spanLabel(3 / 365)).toBe("3 days")
    expect(spanLabel(4.5e9)).toBe("4.5 billion years")
  })

  it("never emits an unbounded number of ticks", () => {
    expect(ticks({ start: 0, span: 1e-9 }, 1000).length).toBeLessThanOrEqual(400)
    expect(ticks({ start: 0, span: 3e10 }, 1e6).length).toBeLessThanOrEqual(400)
  })
})


describe("layout", () => {
  const lane = [{ top: 0, bottom: 400 }]
  const item = (id: string, x: number, importance?: number, order = 0): LayoutItem => ({ id, x, importance, height: 100, lane: 0, order })

  it("maps importance to perspective depth", () => {
    expect(depthFor(5)).toEqual({ depth: 0, scale: 1, fog: 0 })
    expect(depthFor(1).scale).toBeLessThan(depthFor(3).scale)
    expect(depthFor(1).fog).toBeGreaterThan(depthFor(3).fog)
    expect(depthFor(undefined)).toEqual(depthFor(3))
    expect(depthFor(99)).toEqual(depthFor(5))
  })

  it("places important cards nearest the axis and stacks the rest above without overlap", () => {
    const placed = layoutCards([item("minor", 10, 1, 0), item("major", 0, 5, 1), item("mid", 20, 3, 2)], { lanes: lane, baseScale: 1 })
    const major = placed.get("major")!
    expect(major.top + major.height).toBe(400 - MIN_STEM)
    const boxes = [...placed.values()]
    for (const a of boxes)
      for (const b of boxes) {
        if (a === b) continue
        const apart = a.left + a.width + CARD_GAP <= b.left || b.left + b.width + CARD_GAP <= a.left || a.top + a.height + CARD_GAP <= b.top || b.top + b.height + CARD_GAP <= a.top
        expect(apart, `${a.id} vs ${b.id}`).toBe(true)
      }
    expect(placed.get("minor")!.top).toBeLessThan(placed.get("mid")!.top)
    expect(placed.get("major")!.zIndex).toBeGreaterThan(placed.get("minor")!.zIndex)
  })

  it("drops the least important cards when there's no room, and keeps far-apart cards on the baseline", () => {
    const crowd = Array.from({ length: 20 }, (_, i) => item(`e${i}`, i, i === 7 ? 5 : 2, i))
    const placed = layoutCards(crowd, { lanes: lane, baseScale: 1 })
    expect(placed.has("e7")).toBe(true)
    expect(placed.size).toBeLessThan(20)
    const apart = layoutCards([item("a", 0), item("b", 1000)], { lanes: lane, baseScale: 1 })
    expect(apart.get("a")!.top).toBe(apart.get("b")!.top)
  })

  it("always places a pinned card", () => {
    const crowd = Array.from({ length: 20 }, (_, i) => item(`e${i}`, i, 5, i))
    expect(layoutCards(crowd, { lanes: lane, baseScale: 1 }).has("e19")).toBe(false)
    expect(layoutCards(crowd, { lanes: lane, baseScale: 1, pinnedId: "e19" }).has("e19")).toBe(true)
  })

  it("estimates card heights per style", () => {
    const base = { title: "Short", hasImage: false }
    expect(cardHeight({ ...base, style: "classic", hasImage: true })).toBeGreaterThan(cardHeight({ ...base, style: "classic" }))
    expect(cardHeight({ ...base, style: "classic", title: "A much longer title that wraps over several lines" })).toBeGreaterThan(cardHeight({ ...base, style: "classic" }))
    expect(cardHeight({ ...base, style: "image" })).toBe(cardHeight({ ...base, style: "classic" })) // no image → classic
    expect(cardHeight({ ...base, style: "note", description: "x".repeat(200) })).toBeGreaterThan(cardHeight({ ...base, style: "note" }))
  })

  it("assigns rows for overlapping periods and lanes for groups", () => {
    const rows = assignRows([{ id: "a", x1: 0, x2: 10 }, { id: "b", x1: 5, x2: 15 }, { id: "c", x1: 20, x2: 30 }], 3, 0)
    expect([rows.get("a"), rows.get("b"), rows.get("c")]).toEqual([0, 1, 0])
    expect(laneGroups(["A", "B", undefined])).toEqual(["A", "B", ""])
    expect(laneGroups(["A", "A"])).toBeNull()
    expect(laneGroups(["a", "b", "c", "d", "e", "f", "g"])).toBeNull()
    const lanes = splitLanes(0, 300, 3)
    expect(lanes[0].bottom).toBe(300)
    expect(lanes[2].top).toBe(0)
  })
})


describe("colours", () => {
  it("maps palette names to theme variables and keeps hex", () => {
    expect(cssColor("chart-1")).toBe("var(--chart-1)")
    expect(cssColor("#112233")).toBe("#112233")
  })

  it("assigns category colours in order of first appearance, then fixed hues", () => {
    const colors = categoryColors(["Painting", undefined, "Institution", "Painting", ""])
    expect([...colors.entries()]).toEqual([["Painting", "chart-1"], ["Institution", "chart-2"]])
    const many = categoryColors(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"])
    expect([...many.values()]).toEqual(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "#c2417a", "#8d6e4c", "#4f7cac", "#9c4fc2", "#5c8a3a", "chart-1"])
  })

  it("colours events by style, then category; eras share their category's colour", () => {
    const model = normalizeTimeline({
      events: [
        { id: "late", title: "Late", start: { year: 2000 }, category: "B" },
        { id: "early", title: "Early", start: { year: 1000 }, category: "A", style: { color: "#AA3300" } },
        { id: "plain", title: "Plain", start: { year: 1500 } },
      ],
      eras: [{ title: "Era", start: { year: 1 }, end: { year: 2 }, category: "A" }, { title: "Bare", start: { year: 3 }, end: { year: 4 } }, { title: "New", start: { year: 5 }, end: { year: 6 }, category: "C" }],
    })
    // First appearance in the data as given, not in date order.
    expect(model.colors.get("B")).toBe("chart-1")
    expect(model.colors.get("A")).toBe("chart-2")
    expect(model.colors.get("C")).toBe("chart-3")
    const [early, plain, late] = model.events
    expect(eventColor(early, model.colors)).toBe("#AA3300")
    expect(eventColor(late, model.colors)).toBe("chart-1")
    expect(eventColor(plain, model.colors)).toBe("primary")
    expect(model.eras.map((e) => eraColor(e, model.colors))).toEqual(["chart-2", undefined, "chart-3"])
  })

  it("picks legible ink by WCAG contrast", () => {
    expect(hexInk("#ffffff")).toBe("black")
    expect(hexInk("#000000")).toBe("white")
    expect(hexInk("#7a1f2b")).toBe("white")
    expect(hexInk("#f5d76e")).toBe("black")
    expect(hexInk("chart-1")).toBeNull()
    expect(contrastRatio(relativeLuminance([1, 1, 1]), relativeLuminance([0, 0, 0]))).toBeCloseTo(21, 5)
  })

  it("parses browser-computed colours", () => {
    expect(parseCssColor("rgb(255, 0, 0)")).toEqual([1, 0, 0])
    expect(parseCssColor("rgba(0, 0, 255, 0.5)")).toEqual([0, 0, 1])
    expect(parseCssColor("color(srgb 1 1 1)")).toEqual([1, 1, 1])
    expect(inkFor(parseCssColor("oklch(0.95 0.02 90)")!)).toBe("black")
    expect(inkFor(parseCssColor("oklch(0.3 0.1 250)")!)).toBe("white")
    expect(inkFor(parseCssColor("oklab(0.9 0 0)")!)).toBe("black")
    expect(parseCssColor("color-mix(in oklch, red, blue)")).toBeNull()
  })
})


describe("filtering", () => {
  const { events } = normalizeTimeline({
    events: [
      { id: "1", title: "Velázquez paints", start: { year: 1656 }, category: "Painting", group: "Art", tags: ["baroque"] },
      { id: "2", title: "Museum opens", start: { year: 1819 }, category: "Institution", group: "History", description: "Royal collection" },
      { id: "3", title: "Goya", start: { year: 1800 }, category: "Painting", tags: ["romantic", "baroque"] },
    ],
  })

  it("collects facets", () => {
    expect(facetsOf(events)).toEqual({ categories: ["Institution", "Painting"], groups: ["Art", "History"], tags: ["baroque", "romantic"] })
    expect(hasFacets(facetsOf(events), events.length)).toBe(true)
    expect(hasFacets({ categories: [], groups: [], tags: [] }, 3)).toBe(false)
  })

  it("filters by category, group, tags and text", () => {
    const ids = (f: Partial<typeof EMPTY_FILTER>) => applyFilter(events, { ...EMPTY_FILTER, ...f }).map((e) => e.id)
    expect(ids({})).toEqual(["1", "3", "2"])
    expect(ids({ categories: ["Painting"] })).toEqual(["1", "3"])
    expect(ids({ group: "History" })).toEqual(["2"])
    expect(ids({ tags: ["romantic"] })).toEqual(["3"])
    expect(ids({ query: "royal" })).toEqual(["2"])
    expect(ids({ query: "baroque goya" })).toEqual(["3"])
    expect(ids({ categories: ["Painting"], group: "History" })).toEqual([])
  })
})


describe("legacy-shape fallback", () => {
  it("keeps the old list only for the old { date, title } shape", () => {
    expect(isLegacyListProps({ events: [{ date: "2026", title: "Ship" }] })).toBe(true)
    expect(isLegacyListProps({ events: [] })).toBe(true)
    expect(isLegacyListProps({})).toBe(true)
    expect(isLegacyListProps(null)).toBe(true)
    expect(isLegacyListProps({ events: [{ id: "a", title: "A", start: { year: 1 } }] })).toBe(false)
    expect(isLegacyListProps({ table: { columns: [], rows: [], map: {} } })).toBe(false)
    expect(isLegacyListProps({ events: [], eras: [] })).toBe(false)
    expect(isLegacyListProps({ events: [], title: "T" })).toBe(false)
    expect(isLegacyListProps({ data: { events: [] } })).toBe(false) // TimelineJS shape → picture timeline
  })
})
