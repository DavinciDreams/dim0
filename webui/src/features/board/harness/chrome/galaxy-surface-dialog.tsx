import { useCallback, useEffect, useState } from "react"
import { screenToWorld } from "@canvas-harness/core"
import { useCanvasStore } from "@canvas-harness/react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { StoreMutator } from "@/features/agent/engine/board-mutator"
import { useDebouncedValue } from "@/features/board/hooks/use-debounce"
import { createGalaxyClient, GalaxyAuthError, type GalaxySurfaceSummary } from "@/features/galaxy/galaxy-client"
import { galaxyUrl } from "@/features/galaxy/galaxy-config"
import { beginGalaxyConnect } from "@/features/galaxy/galaxy-oauth"
import { isConnectedTo, useGalaxyStore } from "@/features/galaxy/galaxy-store"
import { placeGalaxySurface } from "@/features/galaxy/place-surface"
import { useHarnessWrapRef } from "../canvas/wrap-ref-context"
import { useBoardAppStore } from "../store/board-app-store"


export type GalaxySurfaceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}


type Listing =
  | { state: "loading" }
  | { state: "ready"; surfaces: GalaxySurfaceSummary[] }
  | { state: "error"; message: string }


/** Body of the dialog, mounted only while open so nothing is fetched otherwise. */
const GalaxySurfaceDialogBody = ({ onClose }: { onClose: () => void }) => {
  const store = useCanvasStore()
  const wrapRef = useHarnessWrapRef()
  const rootId = useBoardAppStore((s) => s.rootId)
  const tokens = useGalaxyStore((s) => s.tokens)
  const galaxy = galaxyUrl()
  const connected = isConnectedTo(tokens, galaxy)

  const [q, setQ] = useState("")
  const debouncedQ = useDebouncedValue<string>({ value: q, delay: 400 })
  const [listing, setListing] = useState<Listing>({ state: "loading" })
  const [placingId, setPlacingId] = useState<string | null>(null)
  const [placeError, setPlaceError] = useState<string | null>(null)

  useEffect(() => {
    if (!connected) return
    let active = true
    setListing({ state: "loading" })
    createGalaxyClient().listSurfaces(debouncedQ)
      .then((surfaces) => { if (active) setListing({ state: "ready", surfaces }) })
      .catch((error: unknown) => {
        if (active) setListing({ state: "error", message: (error as Error).message })
      })
    return () => { active = false }
  }, [connected, debouncedQ])

  const place = useCallback(async (surface: GalaxySurfaceSummary) => {
    setPlacingId(surface.id)
    setPlaceError(null)
    try {
      const wrap = wrapRef?.current ?? null
      const rect = wrap?.getBoundingClientRect()
      const center = rect
        ? screenToWorld({ x: rect.width / 2, y: rect.height / 2 }, store.getCamera())
        : { x: 0, y: 0 }
      await placeGalaxySurface(createGalaxyClient(), new StoreMutator(store, rootId ?? null), surface.id, center)
      onClose()
    } catch (error) {
      setPlaceError(error instanceof GalaxyAuthError ? error.message : (error as Error).message)
      setPlacingId(null)
    }
  }, [onClose, rootId, store, wrapRef])

  if (!connected) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Connect Galaxy Brain to place your promoted surfaces on this board.
        </p>
        <button
          type="button"
          onClick={() => void beginGalaxyConnect(galaxy, `${window.location.pathname}${window.location.search}`)}
          className="rounded-lg border border-border px-3 py-1.5 font-medium transition hover:bg-accent"
        >
          Connect Galaxy Brain
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Input
        autoFocus
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Search surfaces by title"
        aria-label="Search Galaxy surfaces"
      />
      {placeError && <p role="alert" className="text-sm text-destructive">{placeError}</p>}
      <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin">
        {listing.state === "loading" && [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        {listing.state === "error" && <p className="text-sm text-destructive">{listing.message}</p>}
        {listing.state === "ready" && listing.surfaces.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {debouncedQ ? "No promoted surfaces match." : "You have no promoted surfaces in Galaxy Brain yet."}
          </p>
        )}
        {listing.state === "ready" && listing.surfaces.map((surface) => (
          <button
            key={surface.id}
            type="button"
            disabled={placingId !== null}
            onClick={() => void place(surface)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-accent disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{surface.title}</span>
              <span className="block text-xs text-muted-foreground">
                Version {surface.version}
                {surface.updatedAt ? ` · updated ${new Date(surface.updatedAt).toLocaleDateString()}` : ""}
              </span>
            </span>
            {placingId === surface.id && <span className="shrink-0 text-xs text-muted-foreground">Placing…</span>}
          </button>
        ))}
      </div>
    </div>
  )
}


/** "Insert Galaxy surface": pick a promoted Galaxy Brain surface and place it as an applet note. */
export function GalaxySurfaceDialog({ open, onOpenChange }: GalaxySurfaceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(520px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Insert Galaxy surface</DialogTitle>
        </DialogHeader>
        {open && <GalaxySurfaceDialogBody onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
