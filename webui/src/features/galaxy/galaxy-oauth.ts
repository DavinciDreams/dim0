import { makePkce, randomState } from "@/features/signin/lib/pkce"
import { GALAXY_CLIENT_ID, galaxyRedirectUri } from "./galaxy-config"
import type { GalaxyTokens } from "./galaxy-store"


// Galaxy Brain connection: OAuth 2.0 authorization code + PKCE, with Dim-0 as a
// public client. Same shape as the web Google sign-in (signin/lib/web-google.ts):
// stash the verifier + state, redirect to consent, finish on /galaxy/callback.


const PENDING_KEY = "dim0.galaxy.oauth"


export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>


export type PendingGalaxyOAuth = { verifier: string; state: string; returnTo: string }


/** Galaxy's consent page URL. Pure, so the query is unit-testable. */
export function buildGalaxyAuthorizeUrl(galaxy: string, codeChallenge: string, state: string): string {
  const url = new URL("/oauth/authorize", galaxy)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", GALAXY_CLIENT_ID)
  url.searchParams.set("redirect_uri", galaxyRedirectUri())
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}


/** Only in-app paths may be returned to after connecting. */
export const safeReturnTo = (value: unknown): string =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : "/"


export async function beginGalaxyConnect(galaxy: string, returnTo: string): Promise<void> {
  const { verifier, challenge } = await makePkce()
  const state = randomState()
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({
    verifier, state, returnTo: safeReturnTo(returnTo),
  } satisfies PendingGalaxyOAuth))
  window.location.assign(buildGalaxyAuthorizeUrl(galaxy, challenge, state))
}


/** Read + clear the stashed verifier/state; null when absent or malformed. */
export function consumePendingGalaxyOAuth(): PendingGalaxyOAuth | null {
  const raw = sessionStorage.getItem(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PendingGalaxyOAuth>
    return typeof parsed?.verifier === "string" && typeof parsed.state === "string"
      ? { verifier: parsed.verifier, state: parsed.state, returnTo: safeReturnTo(parsed.returnTo) }
      : null
  } catch {
    return null
  }
}


/** Turn a token-endpoint response into stored tokens, or throw. */
async function readTokens(response: Response, galaxy: string, now: number): Promise<GalaxyTokens> {
  const body = await response.json().catch(() => null) as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
    token_type?: unknown
  } | null
  if (
    !response.ok
    || typeof body?.access_token !== "string"
    || typeof body.refresh_token !== "string"
    || typeof body.expires_in !== "number"
    || body.token_type !== "Bearer"
  ) {
    throw new Error("Galaxy did not accept the connection. Please connect again.")
  }
  return {
    galaxyUrl: galaxy,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: now + body.expires_in * 1000,
  }
}


const postForm = (fetchImpl: FetchFn, url: string, fields: Record<string, string>) =>
  fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  })


export async function exchangeGalaxyCode(
  galaxy: string, code: string, verifier: string, fetchImpl: FetchFn = fetch, now = Date.now(),
): Promise<GalaxyTokens> {
  const response = await postForm(fetchImpl, new URL("/api/oauth/token", galaxy).toString(), {
    grant_type: "authorization_code",
    client_id: GALAXY_CLIENT_ID,
    code,
    code_verifier: verifier,
    redirect_uri: galaxyRedirectUri(),
  })
  return readTokens(response, galaxy, now)
}


/** Galaxy rotates the refresh token on every use, so the result replaces both tokens. */
export async function refreshGalaxyTokens(
  tokens: GalaxyTokens, fetchImpl: FetchFn = fetch, now = Date.now(),
): Promise<GalaxyTokens> {
  const response = await postForm(fetchImpl, new URL("/api/oauth/token", tokens.galaxyUrl).toString(), {
    grant_type: "refresh_token",
    client_id: GALAXY_CLIENT_ID,
    refresh_token: tokens.refreshToken,
  })
  return readTokens(response, tokens.galaxyUrl, now)
}


/** Best-effort revocation when disconnecting; the local copy is dropped either way. */
export async function revokeGalaxyTokens(tokens: GalaxyTokens, fetchImpl: FetchFn = fetch): Promise<void> {
  try {
    await postForm(fetchImpl, new URL("/api/oauth/revoke", tokens.galaxyUrl).toString(), {
      client_id: GALAXY_CLIENT_ID,
      token: tokens.refreshToken,
    })
  } catch {
    // Offline or Galaxy unreachable; the tokens still expire on their own.
  }
}
