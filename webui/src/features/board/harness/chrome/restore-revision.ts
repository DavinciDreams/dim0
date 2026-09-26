import { asNodeId } from "@canvas-harness/core"
import type { CanvasStore } from "@canvas-harness/core"
import type { NoteRevision } from "@/features/board/api/note-revisions"
import type { DimNodeData } from "@/features/board/model"
import { bumpMeta } from "@/features/board/utils/node-meta"


/**
 * Apply a revision's label + content to the note as ONE local batch, so the restore
 * flows through the same undo + persistence + sync path as a human edit. False when
 * the note is no longer on the board.
 */
export const restoreRevision = (store: CanvasStore, noteId: string, revision: NoteRevision): boolean => {
  const id = asNodeId(noteId)
  const node = store.getNode(id)
  if (!node) return false
  const prev = node.data as DimNodeData | undefined
  store.batch(() =>
    store.updateNode(id, {
      content: revision.content,
      data: { ...prev, label: { markdown: revision.label ?? "" }, meta: bumpMeta(prev?.meta) } as DimNodeData,
    }),
  )
  return true
}
