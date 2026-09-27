/**
 * Content version for agent read-before-write checks.
 *
 * A short SHA-256 over the fields an agent write can clobber (type, label,
 * content). `get_note` hands it out; `write_note` / `edit_note` / `delete_note`
 * accept it back as `expected_version` and refuse when the note changed in the
 * meantime (e.g. the user edited it mid-turn). A hash — not `meta.v` — because
 * human canvas edits don't bump the meta counter, and position/size changes are
 * deliberately NOT a conflict.
 */
import type { Node } from "@canvas-harness/core"
import type { DimNodeData } from "@/features/board/model"
import { labelText } from "@/features/board/model"


const VERSION_HEX_CHARS = 12


/** The content version of a node: first 12 hex chars of SHA-256([type, label, content]). */
export const noteVersion = async (node: Node): Promise<string> => {
  const label = labelText((node.data as DimNodeData | undefined)?.label)
  const content = typeof node.content === "string" ? node.content : ""
  const bytes = new TextEncoder().encode(JSON.stringify([node.type, label, content]))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, VERSION_HEX_CHARS)
}


/**
 * `{ error }` when `expected` is given and no longer matches the node's current
 * version, else null. The message carries the current version so the agent can
 * re-read and retry in one step.
 */
export const staleVersionError = async (node: Node, expected: string | undefined): Promise<{ error: string } | null> => {
  if (!expected) return null
  const current = await noteVersion(node)
  if (current === expected) return null
  return {
    error: `note changed since you read it (expected version ${expected}, current ${current}). Re-read it with get_note, then retry against the current content.`,
  }
}
