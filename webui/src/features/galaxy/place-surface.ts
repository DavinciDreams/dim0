import type { BoardMutator, NoteSpec } from "@/features/agent/engine/board-mutator"
import { validateApplet } from "@/features/applet/compile"
import type { GalaxyClient } from "./galaxy-client"
import { surfaceToApplet } from "./surface-to-applet"


export type PlacedSurface = {
  noteId: string
  title: string
  version: number
  /** What the translation could not reproduce exactly (dropped or approximated parts). */
  warnings: string[]
}


/**
 * Fetch a Galaxy surface with its bindings filled in, translate it into applet
 * source, and add it to the board as an applet note. Shared by the "Insert
 * Galaxy surface" dialog and the agent's insert_galaxy_surface tool.
 */
export async function placeGalaxySurface(
  client: GalaxyClient,
  board: BoardMutator,
  surfaceId: string,
  placement: Pick<NoteSpec, "x" | "y" | "near"> = {},
): Promise<PlacedSurface> {
  const { summary, materializedSpec } = await client.getSurface(surfaceId)
  const { source, warnings } = surfaceToApplet(materializedSpec, {
    surfaceId: summary.id,
    version: summary.version,
    title: summary.title,
  })
  // The translator only emits valid applets; checked again because this is
  // network data on its way into a note.
  const validation = validateApplet(source)
  if (!validation.ok) throw new Error(`Galaxy surface could not be converted: ${validation.message}`)
  const created = await board.createNote({ type: "applet", content: source, label: summary.title, ...placement })
  return { noteId: created.id, title: summary.title, version: summary.version, warnings }
}
