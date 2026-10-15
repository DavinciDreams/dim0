import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildGalaxyAuthorizeUrl,
  consumePendingGalaxyOAuth,
  exchangeGalaxyCode,
  refreshGalaxyTokens,
  revokeGalaxyTokens,
  safeReturnTo,
} from "./galaxy-oauth"


const GALAXY = "https://galaxy.example.com"
const tokenResponse = (overrides: Record<string, unknown> = {}, status = 200) =>
  new Response(JSON.stringify({
    access_token: "gb_app_access",
    refresh_token: "gb_apr_refresh",
    expires_in: 3600,
    token_type: "Bearer",
    scope: "plugin:dim0",
    ...overrides,
  }), { status, headers: { "Content-Type": "application/json" } })

const formOf = (call: unknown[]) => new URLSearchParams((call[1] as RequestInit).body as string)


afterEach(() => sessionStorage.clear())


describe("buildGalaxyAuthorizeUrl", () => {
  it("asks Galaxy's consent page for an S256 PKCE authorization code for Dim-0", () => {
    const url = new URL(buildGalaxyAuthorizeUrl(GALAXY, "challenge-abc", "state-xyz"))
    expect(url.origin + url.pathname).toBe(`${GALAXY}/oauth/authorize`)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "dim0",
      redirect_uri: `${window.location.origin}/galaxy/callback`,
      state: "state-xyz",
      code_challenge: "challenge-abc",
      code_challenge_method: "S256",
    })
  })
})


describe("safeReturnTo", () => {
  it("keeps in-app paths and refuses anything that could leave the app", () => {
    expect(safeReturnTo("/boards/abc?x=1")).toBe("/boards/abc?x=1")
    for (const unsafe of ["//evil.example", "/\\evil.example", "https://evil.example", "", null, 42]) {
      expect(safeReturnTo(unsafe)).toBe("/")
    }
  })
})


describe("consumePendingGalaxyOAuth", () => {
  it("is single-use and sanitizes the stored return path", () => {
    sessionStorage.setItem("dim0.galaxy.oauth", JSON.stringify({ verifier: "v", state: "s", returnTo: "//evil" }))
    expect(consumePendingGalaxyOAuth()).toEqual({ verifier: "v", state: "s", returnTo: "/" })
    expect(consumePendingGalaxyOAuth()).toBeNull()
  })

  it("rejects malformed entries", () => {
    sessionStorage.setItem("dim0.galaxy.oauth", "{ not json")
    expect(consumePendingGalaxyOAuth()).toBeNull()
    sessionStorage.setItem("dim0.galaxy.oauth", JSON.stringify({ verifier: "v" }))
    expect(consumePendingGalaxyOAuth()).toBeNull()
  })
})


describe("token endpoint", () => {
  it("exchanges the code with its verifier and the exact redirect URI, form-encoded", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse())
    const tokens = await exchangeGalaxyCode(GALAXY, "the-code", "the-verifier", fetchImpl, 1_000)
    expect(fetchImpl.mock.calls[0][0]).toBe(`${GALAXY}/api/oauth/token`)
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" })
    expect(Object.fromEntries(formOf(fetchImpl.mock.calls[0]))).toEqual({
      grant_type: "authorization_code",
      client_id: "dim0",
      code: "the-code",
      code_verifier: "the-verifier",
      redirect_uri: `${window.location.origin}/galaxy/callback`,
    })
    expect(tokens).toEqual({
      galaxyUrl: GALAXY, accessToken: "gb_app_access", refreshToken: "gb_apr_refresh", expiresAt: 1_000 + 3_600_000,
    })
  })

  it("refuses error responses and malformed token bodies", async () => {
    await expect(exchangeGalaxyCode(GALAXY, "c", "v", vi.fn().mockResolvedValue(tokenResponse({ error: "invalid_grant" }, 400)))).rejects.toThrow()
    await expect(exchangeGalaxyCode(GALAXY, "c", "v", vi.fn().mockResolvedValue(tokenResponse({ token_type: "mac" })))).rejects.toThrow()
    await expect(exchangeGalaxyCode(GALAXY, "c", "v", vi.fn().mockResolvedValue(tokenResponse({ refresh_token: 7 })))).rejects.toThrow()
  })

  it("refreshes against the connection's own Galaxy and replaces both tokens", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse({ access_token: "new-access", refresh_token: "new-refresh" }))
    const next = await refreshGalaxyTokens(
      { galaxyUrl: GALAXY, accessToken: "old", refreshToken: "old-refresh", expiresAt: 0 }, fetchImpl, 5,
    )
    expect(Object.fromEntries(formOf(fetchImpl.mock.calls[0]))).toEqual({
      grant_type: "refresh_token", client_id: "dim0", refresh_token: "old-refresh",
    })
    expect(next).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh", expiresAt: 5 + 3_600_000 })
  })

  it("revokes by refresh token and never throws when Galaxy is unreachable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("offline"))
    await expect(revokeGalaxyTokens(
      { galaxyUrl: GALAXY, accessToken: "a", refreshToken: "r", expiresAt: 0 }, fetchImpl,
    )).resolves.toBeUndefined()
    expect(fetchImpl.mock.calls[0][0]).toBe(`${GALAXY}/api/oauth/revoke`)
    expect(Object.fromEntries(formOf(fetchImpl.mock.calls[0]))).toEqual({ client_id: "dim0", token: "r" })
  })
})
