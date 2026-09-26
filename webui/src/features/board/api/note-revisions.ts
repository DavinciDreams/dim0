import camelcaseKeys from "camelcase-keys"
import { apiFetch } from "@/api"


/** One saved server-side revision of a note (synced boards only). */
export type NoteRevision = {
  id: string
  createdAt: string
  label: string | null
  content: string
}


/**
 * List a note's saved revisions, newest first. Read-only: restoring is done by the
 * caller as a normal local edit, so it syncs to peers and can be undone.
 */
export async function listNoteRevisions(boardId: string, noteId: string): Promise<NoteRevision[]> {
  const res = await apiFetch<{ data: Record<string, unknown> }>({
    path: `/boards/${boardId}/notes/${noteId}/revisions`,
    method: "GET",
  })
  const data = camelcaseKeys(res.data, { deep: true }) as { revisions?: NoteRevision[] }
  return data.revisions ?? []
}
