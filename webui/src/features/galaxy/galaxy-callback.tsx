import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "@/components/icons"
import { galaxyUrl } from "./galaxy-config"
import { consumePendingGalaxyOAuth, exchangeGalaxyCode } from "./galaxy-oauth"
import { useGalaxyStore } from "./galaxy-store"


/**
 * Galaxy Brain redirect landing (`/galaxy/callback`). Checks the returned
 * `state` against the one stashed before the redirect (CSRF), exchanges the
 * single-use code + PKCE verifier for tokens, then goes back to where the
 * person started connecting.
 */
export function GalaxyCallbackPage() {
  const navigate = useNavigate()
  const setTokens = useGalaxyStore((s) => s.setTokens)
  const started = React.useRef(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    // The code is single-use; guard against React StrictMode's double-invoke.
    if (started.current) return
    started.current = true

    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get("error")
    const code = params.get("code")
    const state = params.get("state")
    const pending = consumePendingGalaxyOAuth()
    // The code is spent either way; reloading must not replay it.
    window.history.replaceState(null, "", window.location.pathname)

    void (async () => {
      const galaxy = galaxyUrl()
      if (!galaxy) return setError("Galaxy Brain is not set up for this Dim-0.")
      if (oauthError) return setError("Connecting Galaxy Brain was cancelled.")
      if (!code || !state || !pending) return setError("Galaxy Brain could not be connected. Please try again.")
      if (state !== pending.state) return setError("Connecting Galaxy Brain failed a security check. Please try again.")
      try {
        setTokens(await exchangeGalaxyCode(galaxy, code, pending.verifier))
        await navigate({ to: pending.returnTo, replace: true })
      } catch (e) {
        setError((e as Error).message || "Galaxy Brain could not be connected. Please try again.")
      }
    })()
  }, [navigate, setTokens])

  return (
    <div className="w-full max-w-md mx-auto py-16 text-center">
      {error ? (
        <div className="space-y-4">
          <p className="text-sm text-destructive">{error}</p>
          <Link to="/" replace className="inline-block text-sm font-medium text-primary underline underline-offset-4">
            Back to Dim-0
          </Link>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Connecting Galaxy Brain…
        </div>
      )}
    </div>
  )
}
