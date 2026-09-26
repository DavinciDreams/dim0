import { beforeEach, describe, expect, it } from "vitest"
import { asNodeId } from "@canvas-harness/core"
import type { CanvasStore } from "@canvas-harness/core"
import { freshStore, resetIdb } from "@/test/canvas"
import { selectionRegion } from "./selection-region"


const addRect = (store: CanvasStore, id: string, x: number, y: number, w: number, h: number): void => {
  store.addNode({ id: asNodeId(id), type: "rect", x, y, w, h, angle: 0, groups: [], data: {} })
}


let store: CanvasStore


beforeEach(() => {
  resetIdb()
  store = freshStore("sel")
})


describe("selectionRegion", () => {
  it("is null when nothing is selected", () => {
    addRect(store, "a", 0, 0, 10, 10)
    expect(selectionRegion(store)).toBeNull()
  })

  it("bounds every selected node (e.g. a note plus ink drawn over it)", () => {
    addRect(store, "note", 100, 100, 200, 100)
    addRect(store, "ink", 80, 150, 300, 20)
    addRect(store, "other", 1000, 1000, 10, 10)
    store.setSelection([asNodeId("note"), asNodeId("ink")])
    expect(selectionRegion(store)).toEqual({ x: 80, y: 100, w: 300, h: 100 })
  })
})
