// SVG sanitization + per-instance id scoping for rendered diagrams.
//
// Diagram specs come from the agent and from collaborators, so the SVG Archify
// builds from them is treated as untrusted markup: DOMPurify (SVG profile) strips
// scripts, event handlers, foreignObject, links and inline styles before the
// string is ever inserted into the DOM.

import DOMPurify from "dompurify"


const FORBID_TAGS = ["script", "foreignObject", "foreignobject", "style", "a", "image", "use", "iframe", "animate", "set"]
const FORBID_ATTR = ["style", "href", "xlink:href", "tabindex", "onload", "onclick", "onerror", "onmouseover", "onfocus"]


/** Sanitize an SVG string with DOMPurify's SVG profile; returns "" if nothing safe remains. */
export const sanitizeSvg = (svg: string): string =>
  DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true },
    FORBID_TAGS,
    FORBID_ATTR,
  })


/**
 * Prefix every `id` in an SVG (and the `url(#…)` / `aria-labelledby` references
 * to them) with `scope`, so several diagrams on one page don't resolve each
 * other's markers, patterns or titles.
 */
export const scopeSvgIds = (svg: string, scope: string): string => {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "_")
  const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
  if (ids.size === 0) return svg
  const scoped = (id: string): string => (ids.has(id) ? `${safeScope}-${id}` : id)
  return svg
    .replace(/(\s)id="([^"]+)"/g, (_m, sp: string, id: string) => `${sp}id="${scoped(id)}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${scoped(id)})`)
    .replace(/aria-labelledby="([^"]+)"/g, (_m, list: string) => `aria-labelledby="${list.split(/\s+/).map(scoped).join(" ")}"`)
}
