// Diagram canvas placeholder.
//
// Drawn instead of the React view when zoomed out below `minZoomForReact`
// (see def.ts). Same card style as the other node placeholders, with a small
// three-box "architecture" glyph so it reads as a diagram at a glance.

import type { Node, RenderEnv } from "@canvas-harness/core"


/** Draw the diagram placeholder card + a mini boxes-and-arrows glyph onto the canvas. */
export const drawDiagramPlaceholder = (ctx: CanvasRenderingContext2D, node: Node, env: RenderEnv): void => {
  const { w, h } = node
  const card = (env.theme("card") as string) ?? "#ffffff"
  const stroke = (env.theme("muted-foreground") as string) ?? "#9ca3af"
  const r = Math.min(24, w * 0.06, h * 0.06)

  ctx.save()
  ctx.fillStyle = card
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.5
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, r)
  ctx.fill()
  ctx.globalAlpha = 0.5
  ctx.stroke()

  // Glyph: one box on the left feeding two boxes on the right.
  const gw = Math.min(w * 0.5, 160)
  const gh = Math.min(h * 0.4, 80)
  const x0 = w / 2 - gw / 2
  const y0 = h / 2 - gh / 2
  const bw = gw * 0.3
  const bh = gh * 0.3
  const boxes: Array<[number, number]> = [
    [x0, y0 + gh / 2 - bh / 2],
    [x0 + gw - bw, y0],
    [x0 + gw - bw, y0 + gh - bh],
  ]
  for (const [bx, by] of boxes) {
    ctx.beginPath()
    ctx.roundRect(bx, by, bw, bh, Math.min(4, bh * 0.2))
    ctx.stroke()
  }
  const sx = x0 + bw
  const sy = y0 + gh / 2
  const mx = x0 + gw / 2
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(mx, sy)
  ctx.moveTo(mx, y0 + bh / 2)
  ctx.lineTo(mx, y0 + gh - bh / 2)
  ctx.moveTo(mx, y0 + bh / 2)
  ctx.lineTo(x0 + gw - bw, y0 + bh / 2)
  ctx.moveTo(mx, y0 + gh - bh / 2)
  ctx.lineTo(x0 + gw - bw, y0 + gh - bh / 2)
  ctx.stroke()

  ctx.restore()
}
