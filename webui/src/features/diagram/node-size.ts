// Board-node sizing for diagram notes. Kept free of renderer imports so the agent
// tools and board code can use it without pulling in the lazy render chunk.


/** Default box for a diagram note before its SVG size is known. */
export const DEFAULT_DIAGRAM_SIZE = { w: 720, h: 440 }


// Chrome around the SVG in DiagramNodeView: pt-10 header strip + p-2 padding.
const CHROME_X = 16
const CHROME_Y = 48
const MIN_W = 480
const MAX_W = 1080
const MAX_H = 1400


/** Node box that fits a diagram of `viewBox` size at its own aspect ratio. */
export const diagramNodeSize = (viewBox: { width: number; height: number }): { w: number; h: number } => {
  if (!(viewBox.width > 0 && viewBox.height > 0)) return DEFAULT_DIAGRAM_SIZE
  const w = Math.min(MAX_W, Math.max(MIN_W, Math.round(viewBox.width * 0.75)))
  const h = Math.min(MAX_H, Math.round(((w - CHROME_X) * viewBox.height) / viewBox.width) + CHROME_Y)
  return { w, h }
}
