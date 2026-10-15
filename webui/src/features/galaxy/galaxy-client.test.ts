import { describe, expect, it, vi } from "vitest"
import { createGalaxyClient, GalaxyAuthError } from "./galaxy-client"
import type { FetchFn } from "./galaxy-oauth"
import type { GalaxyTokens } from "./galaxy-store"


const GALAXY = "https://galaxy.example.com"
const NOW = 1_000_000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const fresh = (overrides: Partial<GalaxyTokens> = {}): GalaxyTokens => ({
  galaxyUrl: GALAXY, accessToken: "access-1", refreshToken: "refresh-1", expiresAt: NOW + 3_600_000, ...overrides,
})

/** An in-memory token source; `exclusive` records that refresh ran under the lock. */
function memoryTokens(initial: GalaxyTokens | null) {
  let tokens = initial
  const source = {
    locked: 0,
    read: () => tokens,
    save: (next: GalaxyTokens) => { tokens = next },
    clear: () => { tokens = null },
    exclusive: async <T,>(task: () => Promise<T>) => {
      source.locked += 1
      return task()
    },
    /** Simulate another tab writing the shared store. */
    replace: (next: GalaxyTokens | null) => { tokens = next },
    get current() { return tokens },
  }
  return source
}

const client = (fetchImpl: ReturnType<typeof vi.fn>, tokens: ReturnType<typeof memoryTokens>) =>
  createGalaxyClient({ fetchImpl: fetchImpl as unknown as FetchFn, tokens, galaxy: () => GALAXY, now: () => NOW })

const tokenBody = { access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600, token_type: "Bearer" }


describe("galaxy client", () => {
  it("lists promoted surfaces from the dim0 plugin route with the access token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({
      surfaces: [
        { id: "s-1", title: "Runs", status: "promoted", version: 3, updatedAt: "2026-10-01T00:00:00Z" },
        { id: 42, title: "malformed" },
      ],
    }))
    const surfaces = await client(fetchImpl, memoryTokens(fresh())).listSurfaces("  runs ", 500)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${GALAXY}/api/plugins/dim0/surfaces?limit=200&q=runs`)
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access-1")
    expect(surfaces).toEqual([{ id: "s-1", title: "Runs", status: "promoted", version: 3, updatedAt: "2026-10-01T00:00:00Z" }])
  })

  it("returns the materialized spec for one surface", async () => {
    const spec = { schema: "gb.surface.v1" }
    const fetchImpl = vi.fn().mockResolvedValue(json({
      surface: { id: "s-1", title: "Runs", version: 2 },
      resolved: { materialized_spec: spec, definition: { ignored: true } },
    }))
    const surface = await client(fetchImpl, memoryTokens(fresh())).getSurface("s/1")
    expect(fetchImpl.mock.calls[0][0]).toBe(`${GALAXY}/api/plugins/dim0/surfaces/s%2F1`)
    expect(surface.materializedSpec).toEqual(spec)
    expect(surface.summary.version).toBe(2)
  })

  it("refreshes under the lock shortly before expiry, then uses the new token", async () => {
    const tokens = memoryTokens(fresh({ expiresAt: NOW + 30_000 }))
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(tokenBody))
      .mockResolvedValueOnce(json({ surfaces: [] }))
    await client(fetchImpl, tokens).listSurfaces()
    expect(tokens.locked).toBe(1)
    expect(fetchImpl.mock.calls[0][0]).toBe(`${GALAXY}/api/oauth/token`)
    expect(((fetchImpl.mock.calls[1][1] as RequestInit).headers as Record<string, string>).Authorization).toBe("Bearer access-2")
    expect(tokens.current?.refreshToken).toBe("refresh-2")
  })

  it("uses another tab's refresh instead of rotating the refresh token a second time", async () => {
    const tokens = memoryTokens(fresh({ expiresAt: NOW + 30_000 }))
    const original = tokens.exclusive
    tokens.exclusive = async (task) => {
      // While this tab waited for the lock, another tab refreshed.
      tokens.replace(fresh({ accessToken: "other-tab-access", refreshToken: "other-tab-refresh" }))
      return original(task)
    }
    const fetchImpl = vi.fn().mockResolvedValue(json({ surfaces: [] }))
    await client(fetchImpl, tokens).listSurfaces()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(((fetchImpl.mock.calls[0][1] as RequestInit).headers as Record<string, string>).Authorization).toBe("Bearer other-tab-access")
  })

  it("retries once with a refreshed token when Galaxy answers 401", async () => {
    const tokens = memoryTokens(fresh())
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ error: "Unauthorized" }, 401))
      .mockResolvedValueOnce(json(tokenBody))
      .mockResolvedValueOnce(json({ surfaces: [] }))
    await expect(client(fetchImpl, tokens).listSurfaces()).resolves.toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it("drops the connection and asks to reconnect when the refresh is refused", async () => {
    const tokens = memoryTokens(fresh({ expiresAt: NOW }))
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: "invalid_grant" }, 400))
    await expect(client(fetchImpl, tokens).listSurfaces()).rejects.toBeInstanceOf(GalaxyAuthError)
    expect(tokens.current).toBeNull()
  })

  it("treats a connection to a different Galaxy as not connected", async () => {
    const fetchImpl = vi.fn()
    await expect(client(fetchImpl, memoryTokens(fresh({ galaxyUrl: "https://other.example" }))).listSurfaces())
      .rejects.toBeInstanceOf(GalaxyAuthError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("surfaces Galaxy's error message for other failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: "Invalid surface query" }, 422))
    await expect(client(fetchImpl, memoryTokens(fresh())).listSurfaces()).rejects.toThrow("Invalid surface query")
  })
})
