import { describe, expect, it, vi } from "vitest"
import type { BoardMutator } from "@/features/agent/engine/board-mutator"
import { validateApplet } from "@/features/applet/compile"
import type { ToolContext } from "@/features/agent/engine/types"
import { researchBoard } from "./__fixtures__/surfaces"
import { GalaxyAuthError, type GalaxyClient } from "./galaxy-client"
import { makeGalaxyTools } from "./galaxy-tools"
import { placeGalaxySurface } from "./place-surface"
import { readSurfaceRef } from "./surface-to-applet"


const fakeClient = (overrides: Partial<GalaxyClient> = {}): GalaxyClient => ({
  listSurfaces: vi.fn().mockResolvedValue([
    { id: "s-1", title: "Research board", status: "promoted", version: 4, updatedAt: "2026-10-01T00:00:00Z" },
  ]),
  getSurface: vi.fn().mockResolvedValue({
    summary: { id: "s-1", title: "Research board", status: "promoted", version: 4, updatedAt: null },
    materializedSpec: researchBoard(),
  }),
  ...overrides,
})

const fakeBoard = () => {
  const createNote = vi.fn().mockResolvedValue({ id: "note-1", created: true, placed: true })
  return { board: { createNote } as unknown as BoardMutator, createNote }
}


describe("placeGalaxySurface", () => {
  it("adds the translated surface as a valid applet note that remembers its surface revision", async () => {
    const { board, createNote } = fakeBoard()
    const placed = await placeGalaxySurface(fakeClient(), board, "s-1", { x: 10, y: 20 })
    expect(placed).toMatchObject({ noteId: "note-1", title: "Research board", version: 4 })
    const spec = createNote.mock.calls[0][0]
    expect(spec).toMatchObject({ type: "applet", label: "Research board", x: 10, y: 20 })
    expect(validateApplet(spec.content).ok).toBe(true)
    expect(readSurfaceRef(spec.content)).toEqual({ surfaceId: "s-1", version: 4, title: "Research board" })
  })
})


describe("galaxy agent tools", () => {
  const [list, insert] = makeGalaxyTools(fakeClient())
  const ctx = { board: fakeBoard().board } as unknown as ToolContext

  it("are named for the agent and listed only by the tool factory", () => {
    expect([list.name, insert.name]).toEqual(["list_galaxy_surfaces", "insert_galaxy_surface"])
  })

  it("lists surfaces in a compact form", async () => {
    expect(await list.run({ query: "research" }, ctx)).toEqual({
      surfaces: [{ id: "s-1", title: "Research board", version: 4, updated_at: "2026-10-01T00:00:00Z" }],
    })
  })

  it("inserts a surface onto the board", async () => {
    expect(await insert.run({ surface_id: "s-1" }, ctx)).toMatchObject({ note_id: "note-1", title: "Research board", version: 4 })
  })

  it("tells the agent to have the user reconnect when the connection is gone", async () => {
    const [, broken] = makeGalaxyTools(fakeClient({ getSurface: vi.fn().mockRejectedValue(new GalaxyAuthError()) }))
    const result = await broken.run({ surface_id: "s-1" }, ctx) as { error: string }
    expect(result.error).toMatch(/reconnect it in Settings/)
  })
})
