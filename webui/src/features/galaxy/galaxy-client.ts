import { galaxyUrl } from "./galaxy-config"
import { refreshGalaxyTokens, type FetchFn } from "./galaxy-oauth"
import { isConnectedTo, readStoredGalaxyTokens, useGalaxyStore, type GalaxyTokens } from "./galaxy-store"


// Calls Galaxy Brain's dim0 plugin routes (/api/plugins/dim0/surfaces…) with the
// connection's access token, refreshing it when it is about to expire.
//
// Galaxy rotates refresh tokens and revokes the whole connection if a rotated
// one is ever presented again, so two tabs must never refresh at once: refresh
// runs under a cross-tab Web Lock and re-reads the stored tokens first, in case
// another tab already refreshed.


/** Refresh this long before expiry, so a request never races the deadline. */
const REFRESH_AHEAD_MS = 60_000
const LOCK_NAME = "dim0.galaxy.refresh"


/** The connection is gone (revoked, expired, or never made): connect again. */
export class GalaxyAuthError extends Error {
  constructor(message = "Connect Galaxy Brain again to use your surfaces.") {
    super(message)
    this.name = "GalaxyAuthError"
  }
}


export type GalaxySurfaceSummary = {
  id: string
  title: string
  status: string
  version: number
  updatedAt: string | null
}


export type GalaxySurface = {
  summary: GalaxySurfaceSummary
  /** The surface with its bindings filled in with current data — what to render. */
  materializedSpec: unknown
}


type TokenSource = {
  read: () => GalaxyTokens | null
  save: (tokens: GalaxyTokens) => void
  clear: () => void
  /** Run `task` exclusively across tabs (falls back to running it directly). */
  exclusive: <T>(task: () => Promise<T>) => Promise<T>
}


const browserTokens: TokenSource = {
  read: () => readStoredGalaxyTokens() ?? useGalaxyStore.getState().tokens,
  save: (tokens) => useGalaxyStore.getState().setTokens(tokens),
  clear: () => useGalaxyStore.getState().clear(),
  exclusive: <T,>(task: () => Promise<T>): Promise<T> =>
    typeof navigator !== "undefined" && navigator.locks
      ? (navigator.locks.request(LOCK_NAME, task) as Promise<T>)
      : task(),
}


const summarize = (value: unknown): GalaxySurfaceSummary | null => {
  const s = value as Partial<Record<keyof GalaxySurfaceSummary, unknown>> | null
  if (typeof s?.id !== "string" || typeof s.title !== "string" || typeof s.version !== "number") return null
  return {
    id: s.id,
    title: s.title,
    status: typeof s.status === "string" ? s.status : "promoted",
    version: s.version,
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : null,
  }
}


export function createGalaxyClient(options: {
  fetchImpl?: FetchFn
  tokens?: TokenSource
  galaxy?: () => string
  now?: () => number
} = {}) {
  const fetchImpl: FetchFn = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const tokens = options.tokens ?? browserTokens
  const galaxy = options.galaxy ?? galaxyUrl
  const now = options.now ?? Date.now

  const current = (): GalaxyTokens => {
    const stored = tokens.read()
    if (!isConnectedTo(stored, galaxy())) throw new GalaxyAuthError()
    return stored
  }

  /** A usable access token; `force` refreshes even if the stored one looks fresh. */
  const accessToken = async (force = false, rejected?: string): Promise<string> => {
    const before = current()
    if (!force && before.expiresAt - now() > REFRESH_AHEAD_MS) return before.accessToken
    return tokens.exclusive(async () => {
      const latest = current()
      // Another tab refreshed while this one waited for the lock.
      const refreshedElsewhere = latest.accessToken !== (rejected ?? before.accessToken)
      if (refreshedElsewhere && latest.expiresAt - now() > REFRESH_AHEAD_MS) return latest.accessToken
      try {
        const next = await refreshGalaxyTokens(latest, fetchImpl, now())
        tokens.save(next)
        return next.accessToken
      } catch {
        tokens.clear()
        throw new GalaxyAuthError()
      }
    })
  }

  const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const url = new URL(`/api/plugins/dim0${path}`, galaxy()).toString()
    const send = (token: string) => fetchImpl(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    })
    let token = await accessToken()
    let response = await send(token)
    if (response.status === 401) {
      token = await accessToken(true, token)
      response = await send(token)
      if (response.status === 401) {
        tokens.clear()
        throw new GalaxyAuthError()
      }
    }
    const body = await response.json().catch(() => null) as { error?: unknown } | null
    if (!response.ok) {
      throw new Error(typeof body?.error === "string" ? body.error : `Galaxy request failed (${response.status})`)
    }
    return body
  }

  return {
    /** Promoted surfaces, newest first; `query` filters by title. */
    async listSurfaces(query = "", limit = 50): Promise<GalaxySurfaceSummary[]> {
      const search = new URLSearchParams({ limit: String(Math.min(Math.max(limit, 1), 200)) })
      if (query.trim()) search.set("q", query.trim().slice(0, 240))
      const body = await request(`/surfaces?${search.toString()}`) as { surfaces?: unknown } | null
      return Array.isArray(body?.surfaces)
        ? body.surfaces.map(summarize).filter((s): s is GalaxySurfaceSummary => s !== null)
        : []
    },

    /** One surface, ready to translate into an applet. */
    async getSurface(id: string): Promise<GalaxySurface> {
      const body = await request(`/surfaces/${encodeURIComponent(id)}`) as {
        surface?: unknown
        resolved?: { materialized_spec?: unknown }
      } | null
      const summary = summarize(body?.surface)
      if (!summary || body?.resolved?.materialized_spec === undefined) {
        throw new Error("Galaxy returned a surface Dim-0 cannot read.")
      }
      return { summary, materializedSpec: body.resolved.materialized_spec }
    },
  }
}


export type GalaxyClient = ReturnType<typeof createGalaxyClient>


/** The client for this deployment's Galaxy, or null when not configured/connected. */
export function connectedGalaxyClient(): GalaxyClient | null {
  return isConnectedTo(useGalaxyStore.getState().tokens, galaxyUrl()) ? createGalaxyClient() : null
}
