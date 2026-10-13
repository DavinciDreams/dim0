import { defineNode } from "@canvas-harness/core"

import { drawDiagramPlaceholder } from "./placeholder"
import { DiagramNodeView } from "./view"


/**
 * Diagram node — a typed architecture / sequence / workflow diagram whose JSON
 * spec lives in `content` and renders to SVG via the vendored Archify renderers
 * (see features/diagram). Same LOD mechanism as `applet`: the React view mounts at
 * or above `minZoomForReact`; below it the cheap canvas glyph paints instead.
 */
export const diagramDef = defineNode({
  type: "diagram",
  view: DiagramNodeView,
  drawPlaceholder: drawDiagramPlaceholder,
  lod: { minZoomForReact: 0.2, minZoomForPlaceholder: 0.05 },
  hitTest: (node, p) => p.x >= 0 && p.x <= node.w && p.y >= 0 && p.y <= node.h,
})
