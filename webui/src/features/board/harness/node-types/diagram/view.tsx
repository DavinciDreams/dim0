// On-canvas view for a diagram note.
//
// The note's `content` is a typed diagram spec (JSON: architecture / sequence /
// workflow). It is rendered to SVG by the vendored Archify renderers, which load
// lazily on first render (features/diagram/load.ts) so the board bundle doesn't
// carry them. The SVG is DOMPurify-sanitized and id-scoped before insertion, and
// scales to fit the node box (viewBox + preserveAspectRatio). An invalid spec
// shows its validation error inside the node.

import { TreeStructureIcon } from "@phosphor-icons/react"
import { type NodeId } from "@canvas-harness/core"
import { useCanvasStore, useNode } from "@canvas-harness/react"

import { useDiagramRender } from "@/features/diagram/use-diagram-render"
import { removeNodeSubtree } from "@/features/board/harness/graph/subtree"

import type { NoteNodeData } from "../../convert/note-to-node"
import { NodeTitleCaption, NodeTrafficLights } from "../../shared-views"
import { useBoardAppStore } from "../../store/board-app-store"

import "@/features/diagram/diagram.css"


export interface DiagramViewProps {
  id: NodeId
}


/** Canvas view for a diagram note: renders the spec's SVG, or its error message. */
export function DiagramNodeView({ id }: DiagramViewProps) {
  const node = useNode(id)
  const store = useCanvasStore()
  const canEdit = useBoardAppStore((s) => s.canEdit)
  const noteId = id as unknown as string
  const source = node?.content ?? ""
  const rendered = useDiagramRender(source, `dg-${noteId}`)

  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const label = data.label?.markdown

  return (
    <div className="pointer-events-none relative h-full w-full select-none">
      <div className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-border bg-card px-2 pb-2 pt-10">
        {!source.trim() ? (
          <Message>Diagram spec will render here</Message>
        ) : rendered.status === "ok" ? (
          <div
            className="dim0-diagram h-full w-full"
            role="img"
            aria-label={label || "Diagram"}
            // Sanitized by DOMPurify (SVG profile) in features/diagram/render.ts.
            dangerouslySetInnerHTML={{ __html: rendered.svg }}
          />
        ) : rendered.status === "error" ? (
          <div className="scrollbar-thin h-full w-full overflow-auto rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <p className="mb-1 text-xs font-semibold text-destructive">Diagram could not render</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">{rendered.error}</pre>
          </div>
        ) : (
          <Message>Rendering…</Message>
        )}
      </div>

      <NodeTrafficLights onDelete={canEdit ? () => removeNodeSubtree(store, id) : undefined} />

      <div className="pointer-events-auto absolute left-1/2 top-full z-20 mt-2 w-full -translate-x-1/2">
        <NodeTitleCaption
          nodeId={id}
          label={label}
          placeholder="Untitled diagram"
          textClassName="text-center text-sm font-handwriting text-foreground"
        />
      </div>
    </div>
  )
}


/** Centered placeholder line with the diagram glyph. */
function Message({ children }: { children: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
      <TreeStructureIcon className="size-5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
