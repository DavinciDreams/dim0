import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { asNodeId } from "@canvas-harness/core"
import type { CanvasStore } from "@canvas-harness/core"
import { freshStore, resetIdb } from "@/test/canvas"
import { useDragToPan } from "./use-drag-to-pan"


let store: CanvasStore
let wrap: HTMLDivElement
let canvas: HTMLCanvasElement


/** Dispatch a pointer-ish mouse event (jsdom has no PointerEvent constructor). */
const fire = (target: EventTarget, type: string, x: number, y: number, init: MouseEventInit = {}): boolean =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }))


beforeEach(() => {
  resetIdb()
  store = freshStore("pan")
  store.setCamera({ x: 0, y: 0, z: 1 })
  store.addNode({ id: asNodeId("n1"), type: "rect", x: 100, y: 100, w: 100, h: 50, angle: 0, groups: [], data: {} })
  wrap = document.createElement("div")
  canvas = document.createElement("canvas")
  wrap.appendChild(canvas)
  document.body.appendChild(wrap)
  renderHook(() => useDragToPan({ current: wrap }, store, true))
})


afterEach(() => {
  document.body.innerHTML = ""
})


describe("useDragToPan", () => {
  it("pans when dragging empty canvas, and the engine never sees the press", () => {
    let engineSaw = false
    canvas.addEventListener("pointerdown", () => { engineSaw = true })
    fire(canvas, "pointerdown", 500, 500)
    fire(window, "pointermove", 540, 520)
    fire(window, "pointerup", 540, 520)
    expect(engineSaw).toBe(false)
    const cam = store.getCamera()
    expect(cam.x !== 0 || cam.y !== 0).toBe(true)
  })

  it("leaves presses on a node to the engine (select / move)", () => {
    let engineSaw = false
    canvas.addEventListener("pointerdown", () => { engineSaw = true })
    fire(canvas, "pointerdown", 150, 120)
    expect(engineSaw).toBe(true)
  })

  it("leaves Shift+drag to the engine for box selection", () => {
    let engineSaw = false
    canvas.addEventListener("pointerdown", () => { engineSaw = true })
    fire(canvas, "pointerdown", 500, 500, { shiftKey: true })
    expect(engineSaw).toBe(true)
  })

  it("treats a click on empty canvas as deselect", () => {
    store.setSelection([asNodeId("n1")])
    fire(canvas, "pointerdown", 500, 500)
    fire(window, "pointerup", 501, 500)
    expect(store.getSelection()).toEqual([])
    expect(store.getCamera()).toMatchObject({ x: 0, y: 0 })
  })
})
