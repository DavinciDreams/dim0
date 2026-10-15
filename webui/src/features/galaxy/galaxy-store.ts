import { create } from "zustand"


const STORAGE_KEY = "dim0.galaxy"


/** A Galaxy connection: OAuth tokens for one Galaxy origin. The access token is
 *  short-lived and limited to Galaxy's dim0 surface routes. */
export type GalaxyTokens = {
  galaxyUrl: string
  accessToken: string
  refreshToken: string
  /** Epoch ms when the access token stops working. */
  expiresAt: number
}


const isTokens = (value: unknown): value is GalaxyTokens => {
  const t = value as Partial<GalaxyTokens> | null
  return typeof t?.galaxyUrl === "string"
    && typeof t.accessToken === "string"
    && typeof t.refreshToken === "string"
    && typeof t.expiresAt === "number"
}


/** Read the stored connection fresh from localStorage — another tab may have
 *  refreshed it since this tab last looked. */
export function readStoredGalaxyTokens(): GalaxyTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return isTokens(parsed) ? parsed : null
  } catch {
    return null
  }
}


const write = (tokens: GalaxyTokens | null) => {
  try {
    if (tokens) localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage is unavailable (private mode); the connection lasts for this tab only.
  }
}


type GalaxyState = {
  tokens: GalaxyTokens | null
  setTokens: (tokens: GalaxyTokens) => void
  clear: () => void
}


export const useGalaxyStore = create<GalaxyState>((set) => ({
  tokens: readStoredGalaxyTokens(),
  setTokens: (tokens) => {
    write(tokens)
    set({ tokens })
  },
  clear: () => {
    write(null)
    set({ tokens: null })
  },
}))


// Keep every tab on the same connection: a refresh or disconnect in one tab
// shows up in the others.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) useGalaxyStore.setState({ tokens: readStoredGalaxyTokens() })
  })
}


/** Connected to this deployment's Galaxy (a connection to another origin doesn't count). */
export const isConnectedTo = (tokens: GalaxyTokens | null, url: string): tokens is GalaxyTokens =>
  tokens !== null && url !== "" && tokens.galaxyUrl === url
