import { beforeEach, describe, expect, it } from "vitest"
import { asNodeId } from "@canvas-harness/core"
import type { CanvasStore } from "@canvas-harness/core"
import { freshStore, resetIdb } from "@/test/canvas"
import type { DimNodeData } from "@/features/board/model"
import { restoreRevision } from "./restore-revision"


let store: CanvasStore


beforeEach(() => {
  resetIdb()
  store = freshStore("hist")
  store.addNode({
    id: asNodeId("n1"), type: "rect", x: 0, y: 0, w: 100, h: 50, angle: 0, groups: [],
    content: "current body",
    data: { label: { markdown: "Current" }, meta: { v: 3, createdAt: 1, updatedAt: 5 } } satisfies DimNodeData,
  })
})


const revision = { id: "r1", createdAt: "2026-09-26T12:00:00Z", label: "Old", content: "old body" }


describe("restoreRevision", () => {
  it("applies the revision's label and content and advances meta", () => {
    expect(restoreRevision(store, "n1", revision)).toBe(true)
    const node = store.getNode(asNodeId("n1"))
    const data = node?.data as DimNodeData
    expect(node?.content).toBe("old body")
    expect(data.label).toEqual({ markdown: "Old" })
    expect(data.meta?.v).toBe(4)
    expect(data.meta?.createdAt).toBe(1)
  })

  it("is one undo step back to the current version", () => {
    restoreRevision(store, "n1", revision)
    store.undo()
    expect(store.getNode(asNodeId("n1"))?.content).toBe("current body")
  })

  it("returns false for a note that's gone", () => {
    expect(restoreRevision(store, "ghost", revision)).toBe(false)
  })
})
