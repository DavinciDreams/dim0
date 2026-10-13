// Board-node sizing for diagram notes. Kept free of renderer imports so the agent
// tools and board code can use it without pulling in the lazy render chunk.


/** Default box for a diagram note before its SVG size is known. */
export const DEFAULT_DIAGRAM_SIZE = { w: 720, h: 440 }


// Chrome around the SVG in DiagramNodeView: pt-10 header strip + p-2 padding.
const CHROME_X = 16
const CHROME_Y = 48
const MIN_W = 480
// Longest side a diagram box grows to; beyond it the whole diagram scales down
// (keeping its aspect) instead of being drawn smaller than its natural size.
const MAX_SIDE = 2400


/**
 * Node box that shows the whole diagram at its natural (1:1) size plus the
 * header chrome, so a new diagram is readable without resizing. Very large
 * diagrams shrink uniformly to fit MAX_SIDE; tiny ones widen to MIN_W.
 */
export const diagramNodeSize = (viewBox: { width: number; height: number }): { w: number; h: number } => {
  if (!(viewBox.width > 0 && viewBox.height > 0)) return DEFAULT_DIAGRAM_SIZE
  const scale = Math.min(1, MAX_SIDE / Math.max(viewBox.width, viewBox.height))
  const svgW = Math.max(MIN_W - CHROME_X, viewBox.width * scale)
  const svgH = (svgW * viewBox.height) / viewBox.width
  return { w: Math.round(svgW + CHROME_X), h: Math.round(svgH + CHROME_Y) }
}
