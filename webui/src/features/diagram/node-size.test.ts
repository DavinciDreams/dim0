import { describe, expect, it } from "vitest"
import { DEFAULT_DIAGRAM_SIZE, diagramNodeSize } from "./node-size"


describe("diagramNodeSize", () => {
  it("shows the diagram at its natural size plus header chrome", () => {
    expect(diagramNodeSize({ width: 1200, height: 800 })).toEqual({ w: 1216, h: 848 })
  })

  it("shrinks very large diagrams uniformly to the max side", () => {
    const { w, h } = diagramNodeSize({ width: 4800, height: 2400 })
    expect(w).toBe(2416)
    expect(h).toBe(1248) // 2400 * (2400 / 4800) + 48
  })

  it("widens tiny diagrams to the minimum width, keeping aspect", () => {
    expect(diagramNodeSize({ width: 200, height: 100 })).toEqual({ w: 480, h: 280 })
  })

  it("falls back to the default box for an unknown size", () => {
    expect(diagramNodeSize({ width: 0, height: 0 })).toEqual(DEFAULT_DIAGRAM_SIZE)
  })
})
