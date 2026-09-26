import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { CanvasStore } from "@canvas-harness/core"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { listNoteRevisions, type NoteRevision } from "@/features/board/api/note-revisions"
import { restoreRevision } from "./restore-revision"


export type NoteHistoryDialogProps = {
  store: CanvasStore
  boardId: string | null
  /** The note whose history is shown; null closes the dialog. */
  noteId: string | null
  onClose: () => void
}


// Characters of each revision's body shown in the list.
const PREVIEW_CHARS = 400


type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; revisions: NoteRevision[] }


/** Lists a synced note's saved server revisions and restores one on request. */
export function NoteHistoryDialog({ store, boardId, noteId, onClose }: NoteHistoryDialogProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" })

  useEffect(() => {
    if (!boardId || !noteId) return
    let cancelled = false
    setState({ kind: "loading" })
    listNoteRevisions(boardId, noteId)
      .then((revisions) => !cancelled && setState({ kind: "ready", revisions }))
      .catch((e: unknown) => !cancelled && setState({ kind: "error", message: e instanceof Error ? e.message : "Couldn't load history" }))
    return () => {
      cancelled = true
    }
  }, [boardId, noteId])

  const onRestore = (revision: NoteRevision): void => {
    if (!noteId) return
    if (restoreRevision(store, noteId, revision)) {
      toast.success("Restored — press Ctrl+Z to undo")
      onClose()
    } else {
      toast.error("That note is no longer on the board.")
    }
  }

  return (
    <Dialog open={noteId !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>Earlier versions of this note saved on the server. Restoring replaces its title and text.</DialogDescription>
        </DialogHeader>
        {state.kind === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
        {state.kind === "error" && <p className="text-sm text-destructive">{state.message}</p>}
        {state.kind === "ready" && state.revisions.length === 0 && (
          <p className="text-sm text-muted-foreground">No earlier versions saved yet.</p>
        )}
        {state.kind === "ready" && (
          <ul className="space-y-3">
            {state.revisions.map((revision) => (
              <li key={revision.id} className="rounded-md border border-border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <time className="text-xs text-muted-foreground" dateTime={revision.createdAt}>
                    {new Date(revision.createdAt).toLocaleString()}
                  </time>
                  <Button size="sm" variant="outline" onClick={() => onRestore(revision)}>
                    Restore
                  </Button>
                </div>
                {revision.label && <div className="text-sm font-medium">{revision.label}</div>}
                <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {revision.content.slice(0, PREVIEW_CHARS)}
                  {revision.content.length > PREVIEW_CHARS ? "…" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
