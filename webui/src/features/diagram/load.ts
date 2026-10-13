// Lazy entry point for the diagram renderer. The renderer (vendored Archify +
// DOMPurify) stays out of the main board bundle: it is fetched the first time a
// diagram note renders or the agent writes one, then cached.

type DiagramRenderModule = typeof import("./render")


let pending: Promise<DiagramRenderModule> | null = null


/** Dynamically import (once) the diagram render module. */
export const loadDiagramRenderer = (): Promise<DiagramRenderModule> => {
  pending ??= import("./render").catch((err: unknown) => {
    pending = null // allow a retry after a transient chunk-load failure
    throw err
  })
  return pending
}
