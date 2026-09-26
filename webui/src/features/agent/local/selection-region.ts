import { nodeAABB, unionRects } from "@canvas-harness/core"
import type { CanvasStore, Node, NodeId, WorldRect } from "@canvas-harness/core"


/**
 * World-space bounding box of the user's selected nodes (edges ignored), or null
 * when nothing is selected. Used to point the turn's screenshot at exactly what
 * the user attached as context — including ink annotations they selected with it.
 */
export const selectionRegion = (store: CanvasStore): WorldRect | null => {
  const nodes = store
    .getSelection()
    .map((id) => store.getNode(id as NodeId))
    .filter((n): n is Node => n !== undefined)
  return unionRects(nodes.map(nodeAABB))
}
