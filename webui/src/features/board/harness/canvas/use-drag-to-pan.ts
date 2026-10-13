import { useEffect, type RefObject } from "react"
import { hitTestAny, panByScreen, screenToWorld } from "@canvas-harness/core"
import type { CanvasStore, EdgeId, NodeId } from "@canvas-harness/core"


// Pointer travel (px) before a press on empty canvas counts as a drag, not a click.
const DRAG_THRESHOLD_PX = 4


/**
 * Select-tool navigation without a separate Pan tool: a plain left-drag that
 * starts on EMPTY canvas pans the view, while Shift/Ctrl/Cmd/Alt+drag falls
 * through to the engine's marquee selection. Presses on nodes, edges or
 * selection handles are untouched (select / move / resize work as before), and a
 * click on empty canvas without movement still clears the selection.
 *
 * Runs in the capture phase on the canvas wrapper, so it claims the gesture
 * before the engine's own pointer handler starts a marquee.
 */
export const useDragToPan = (wrapRef: RefObject<HTMLElement | null>, store: CanvasStore, enabled: boolean): void => {
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || !enabled) return

    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      // Only the canvas surface itself: DOM overlays (captions, node chrome,
      // menus) keep their own pointer behavior.
      const surface = e.target
      if (!(surface instanceof HTMLCanvasElement)) return
      const rect = surface.getBoundingClientRect()
      const camera = store.getCamera()
      const world = screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }, camera)
      const selected = store.getSelection()
      const hit = hitTestAny(
        store,
        world,
        camera.z,
        new Set(selected.filter((id) => store.getNode(id as NodeId)) as NodeId[]),
        new Set(selected.filter((id) => store.getEdge(id as EdgeId)) as EdgeId[]),
      )
      if (hit) return

      e.stopPropagation()
      e.preventDefault()
      const pointerId = e.pointerId
      const startX = e.clientX
      const startY = e.clientY
      let lastX = startX
      let lastY = startY
      let dragging = false

      const onMove = (ev: PointerEvent): void => {
        if (ev.pointerId !== pointerId) return
        ev.stopPropagation()
        if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return
        if (!dragging) wrap.style.cursor = "grabbing"
        dragging = true
        store.setCamera(panByScreen(store.getCamera(), { x: ev.clientX - lastX, y: ev.clientY - lastY }))
        lastX = ev.clientX
        lastY = ev.clientY
      }
      const onUp = (ev: PointerEvent): void => {
        if (ev.pointerId !== pointerId) return
        ev.stopPropagation()
        // A click (no drag) on empty canvas keeps its usual meaning: deselect.
        if (!dragging && store.getSelection().length > 0) store.setSelection([])
        wrap.style.cursor = ""
        window.removeEventListener("pointermove", onMove, true)
        window.removeEventListener("pointerup", onUp, true)
        window.removeEventListener("pointercancel", onUp, true)
      }
      window.addEventListener("pointermove", onMove, true)
      window.addEventListener("pointerup", onUp, true)
      window.addEventListener("pointercancel", onUp, true)
    }

    wrap.addEventListener("pointerdown", onPointerDown, { capture: true })
    return () => wrap.removeEventListener("pointerdown", onPointerDown, { capture: true })
  }, [wrapRef, store, enabled])
}
