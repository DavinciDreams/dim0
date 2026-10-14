// Rebuild-don't-inject SVG drawing for the applet <SVGPreview> (see svg-preview.tsx).
// Mirrors Galaxy Brain's components/surfaces/surface-svg.tsx: the source is parsed
// into a detached XML document and a fresh drawing is rebuilt under ./svg-policy,
// then re-checked in place by DOMPurify as defence in depth.

import DOMPurify from "dompurify"

import {
  SVG_PLAIN_ATTRIBUTES,
  SVG_TEXT_ELEMENTS,
  isAllowedSvgElement,
  rewriteSvgReferences,
  sanitizeSvgAttribute,
  screenSvgSource,
} from "./svg-policy"


const SVG_NS = "http://www.w3.org/2000/svg"
/** A diagram, not a document: enough for anything an agent draws by hand. */
const MAX_ELEMENTS = 4000
const PURIFY_CONFIG = {
  IN_PLACE: true,
  USE_PROFILES: { svg: true },
  ADD_TAGS: ["use"],
  ADD_ATTR: [...SVG_PLAIN_ATTRIBUTES, "href", "style"],
}


/** Rebuild one allowed element (and its allowed subtree) from the parsed source. */
function rebuild(source: Element, prefix: string, budget: { remaining: number }): SVGElement | null {
  const name = source.localName
  if (source.namespaceURI !== SVG_NS || !isAllowedSvgElement(name)) return null
  if (--budget.remaining < 0) return null

  const element = document.createElementNS(SVG_NS, name)
  for (const attribute of Array.from(source.attributes)) {
    const kept = sanitizeSvgAttribute(name, attribute.name, attribute.value)
    if (kept === null) continue
    const value = rewriteSvgReferences(prefix, attribute.name, kept)
    // `xlink:href` is the legacy spelling; plain `href` is what browsers read.
    element.setAttribute(attribute.name === "xlink:href" ? "href" : attribute.name, value)
  }

  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const rebuilt = rebuild(child as Element, prefix, budget)
      if (rebuilt) element.appendChild(rebuilt)
    } else if (
      (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) &&
      SVG_TEXT_ELEMENTS.has(name)
    ) {
      element.appendChild(document.createTextNode(child.textContent ?? ""))
    }
    // Comments and processing instructions are not part of the drawing.
  }
  return element
}


/** Build a safe, responsive drawing from `source`, or return why it was refused. */
export function drawingFrom(source: unknown, prefix: string): SVGElement | string {
  const rejected = screenSvgSource(source)
  if (rejected) return rejected

  const parsed = new DOMParser().parseFromString(source as string, "image/svg+xml")
  if (parsed.getElementsByTagName("parsererror").length > 0) return "SVG could not be read"
  const root = parsed.documentElement
  if (!root || root.localName !== "svg" || root.namespaceURI !== SVG_NS) return "Source is not an SVG document"

  const drawing = rebuild(root, prefix, { remaining: MAX_ELEMENTS })
  if (!drawing) return "SVG could not be drawn safely"
  try {
    DOMPurify.sanitize(drawing, PURIFY_CONFIG)
  } catch {
    return "SVG could not be drawn safely"
  }

  // Without a viewBox a fixed width and height cannot scale down to fit.
  const width = Number.parseFloat(drawing.getAttribute("width") ?? "")
  const height = Number.parseFloat(drawing.getAttribute("height") ?? "")
  if (!drawing.hasAttribute("viewBox") && width > 0 && height > 0) {
    drawing.setAttribute("viewBox", `0 0 ${width} ${height}`)
  }
  drawing.removeAttribute("width")
  drawing.removeAttribute("height")
  return drawing
}
