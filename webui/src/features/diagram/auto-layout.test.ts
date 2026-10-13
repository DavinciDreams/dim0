import { describe, expect, it } from "vitest"

import { componentSize, placeArchitecture, placeSequence } from "./auto-layout"
import { diagramSpecSchema, type ArchitectureSpec, type SequenceSpec } from "./schema"


const arch = (input: unknown): ArchitectureSpec => diagramSpecSchema.parse(input) as ArchitectureSpec
const seq = (input: unknown): SequenceSpec => diagramSpecSchema.parse(input) as SequenceSpec


type Box = { x: number; y: number; w: number; h: number }


const boxes = (spec: ArchitectureSpec): Box[] =>
  spec.components.map((c) => ({ x: c.pos?.[0] ?? NaN, y: c.pos?.[1] ?? NaN, w: c.size?.[0] ?? NaN, h: c.size?.[1] ?? NaN }))


const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h


describe("placeArchitecture", () => {
  it("places row/col components on a grid", () => {
    const placed = placeArchitecture(arch({
      diagram_type: "architecture",
      meta: { title: "t" },
      components: [
        { id: "a", type: "frontend", label: "A", row: 0, col: 0 },
        { id: "b", type: "backend", label: "B", row: 0, col: 1 },
        { id: "c", type: "database", label: "C", row: 1, col: 0 },
      ],
    }))
    const [a, b, c] = placed.components
    expect(a.pos?.[1]).toBe(b.pos?.[1])
    expect(b.pos?.[0]).toBeGreaterThan((a.pos?.[0] ?? 0) + (a.size?.[0] ?? 0))
    expect(c.pos?.[0]).toBe(a.pos?.[0])
    expect(c.pos?.[1]).toBeGreaterThan((a.pos?.[1] ?? 0) + (a.size?.[1] ?? 0))
  })

  it("lays out unplaced components from connections without overlap", () => {
    const placed = placeArchitecture(arch({
      diagram_type: "architecture",
      meta: { title: "t" },
      components: ["a", "b", "c", "d"].map((id) => ({ id, type: "backend", label: id.toUpperCase() })),
      connections: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "b", to: "d" }],
    }))
    const bs = boxes(placed)
    for (const b of bs) {
      expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true)
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
    }
    for (let i = 0; i < bs.length; i += 1) for (let j = i + 1; j < bs.length; j += 1) expect(overlaps(bs[i], bs[j])).toBe(false)
    // Left-to-right ranks: a source sits left of its target.
    expect(bs[0].x).toBeLessThan(bs[1].x)
  })

  it("keeps explicit pos and size", () => {
    const placed = placeArchitecture(arch({
      diagram_type: "architecture",
      meta: { title: "t" },
      components: [{ id: "a", type: "backend", label: "A", pos: [300, 200], size: [140, 70] }],
    }))
    expect(placed.components[0].pos).toEqual([300, 200])
    expect(placed.components[0].size).toEqual([140, 70])
  })

  it("widens boxes to fit long labels", () => {
    expect(componentSize({ label: "A very long component label" })[0]).toBeGreaterThan(120)
    expect(componentSize({ label: "API" })[0]).toBe(120)
  })
})


describe("placeSequence", () => {
  const spec = seq({
    diagram_type: "sequence",
    meta: { title: "t" },
    participants: [
      { id: "a", type: "frontend", label: "A" },
      { id: "b", type: "backend", label: "B" },
    ],
    messages: [
      { id: "m1", from: "a", to: "b", label: "one" },
      { id: "m2", from: "b", to: "a", label: "two" },
      { id: "m3", from: "a", to: "b", label: "three" },
    ],
    activations: [{ participant: "b", from: "m1", to: "m2" }],
  })

  it("spaces messages evenly in array order", () => {
    const ys = placeSequence(spec).messages.map((m) => m.y ?? NaN)
    expect(ys[0]).toBeGreaterThanOrEqual(160)
    expect(ys[1] - ys[0]).toBe(ys[2] - ys[1])
    expect(ys[1]).toBeGreaterThan(ys[0])
  })

  it("resolves activation message references to y values", () => {
    const placed = placeSequence(spec)
    const [m1, m2] = placed.messages
    const act = placed.activations?.[0]
    expect(typeof act?.from).toBe("number")
    expect(act?.from).toBeLessThan(m1.y ?? 0)
    expect(act?.to).toBeGreaterThan(m2.y ?? 0)
  })

  it("keeps an authored y and derives a viewBox that fits the timeline", () => {
    const placed = placeSequence({ ...spec, messages: spec.messages.map((m, i) => (i === 0 ? { ...m, y: 300 } : m)) })
    expect(placed.messages.map((m) => m.y)).toEqual([300, 340, 380])
    expect(placed.meta.viewBox?.[1]).toBeGreaterThanOrEqual(380 + 83)
  })
})
