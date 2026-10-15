import { z } from "zod"
import { StoreMutator } from "@/features/agent/engine/board-mutator"
import { defineTool, type Tool, type ToolContext } from "@/features/agent/engine/types"
import { GalaxyAuthError, type GalaxyClient } from "./galaxy-client"
import { placeGalaxySurface } from "./place-surface"


// Browser-agent tools for Galaxy Brain surfaces. Offered only while Galaxy is
// connected. They read the user's own promoted surfaces onto their own board —
// no arbitrary URLs and nothing leaves the board — so, unlike web_search/fetch,
// they need no confirm prompt.


const asError = (error: unknown) => ({
  error: error instanceof GalaxyAuthError
    ? "Galaxy Brain is not connected any more. Ask the user to reconnect it in Settings → Galaxy."
    : error instanceof Error ? error.message : "Galaxy Brain request failed.",
})


export const makeGalaxyTools = (client: GalaxyClient): Tool[] => [
  defineTool({
    name: "list_galaxy_surfaces",
    description: "List the user's promoted Galaxy Brain surfaces — ready-made visual panels (charts, tables, knowledge graphs, timelines, stats, SVG figures) kept in Galaxy, newest first. Call before insert_galaxy_surface.",
    parameters: z.object({
      query: z.string().optional().describe("Optional words to match in the surface title."),
    }),
    run: async ({ query }) => {
      try {
        const surfaces = await client.listSurfaces(query ?? "", 25)
        return { surfaces: surfaces.map(({ id, title, version, updatedAt }) => ({ id, title, version, updated_at: updatedAt })) }
      } catch (error) {
        return asError(error)
      }
    },
  }),
  defineTool({
    name: "insert_galaxy_surface",
    description: "Place a Galaxy Brain surface on the board as an applet note, with its bound data at current values. Use an id from list_galaxy_surfaces.",
    parameters: z.object({
      surface_id: z.string().describe("The surface id from list_galaxy_surfaces."),
    }),
    run: async ({ surface_id }, ctx: ToolContext) => {
      try {
        const board = ctx.board ?? new StoreMutator(ctx.store, ctx.rootId ?? null)
        const placed = await placeGalaxySurface(client, board, surface_id)
        return {
          note_id: placed.noteId,
          title: placed.title,
          version: placed.version,
          ...(placed.warnings.length ? { not_reproduced_exactly: placed.warnings.slice(0, 10) } : {}),
        }
      } catch (error) {
        return asError(error)
      }
    },
  }),
]
