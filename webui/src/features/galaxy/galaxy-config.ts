// Where this deployment's Galaxy Brain lives. Like the API base, a runtime
// injection (docker-entrypoint's `__APP_CONFIG__.galaxyUrl`) wins over the baked
// `VITE_GALAXY_URL`; when neither is set, the Galaxy integration is hidden.


/** Dim-0's registered client id on Galaxy Brain (its `dim0` plugin). */
export const GALAXY_CLIENT_ID = "dim0"


/** The scope Galaxy grants Dim-0: its plugin's surface routes, nothing else. */
export const GALAXY_SCOPE = "plugin:dim0"


/** A configured origin, or "" — an unsubstituted `${…}` template placeholder counts as unset. */
const normalize = (value: string | undefined): string => {
  const trimmed = value?.trim() ?? ""
  if (!trimmed || trimmed.startsWith("${")) return ""
  try {
    const url = new URL(trimmed)
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : ""
  } catch {
    return ""
  }
}


/** The Galaxy Brain origin, or "" when this deployment has none. */
export function galaxyUrl(): string {
  const runtime = typeof window !== "undefined" ? window.__APP_CONFIG__?.galaxyUrl : undefined
  return normalize(runtime) || normalize(import.meta.env.VITE_GALAXY_URL as string | undefined)
}


export const isGalaxyConfigured = (): boolean => galaxyUrl() !== ""


/** Galaxy redirects back here after consent; it must be registered in Galaxy's
 *  `DIM0_CONNECT_REDIRECT_URIS`, exactly. */
export const galaxyRedirectUri = (): string => `${window.location.origin}/galaxy/callback`
