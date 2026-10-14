// What an applet <SVGPreview> may draw. A line-for-line TypeScript port of Galaxy
// Brain's `lib/surface-svg-policy.js` (the gb.surface.v1 SVGPreview policy), kept
// identical so a surface imported from Galaxy Brain draws exactly what it draws
// there — and nothing more.
//
// SVG is a document format, not a picture: it can carry scripts, event handlers,
// embedded HTML and fetches to arbitrary URLs. The component therefore never
// injects SVG markup. It parses the source into a detached XML document and
// rebuilds a fresh drawing, asking this module about every element and attribute;
// anything not named here is dropped. Pure functions, testable without a DOM.


/** Elements a static diagram is made of. Nothing that loads, embeds or runs. */
export const SVG_ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
  "svg", "g", "defs", "symbol", "use", "title", "desc",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan",
  "marker", "clipPath", "linearGradient", "radialGradient", "stop", "pattern",
])


/** Elements whose text content is part of the drawing. */
export const SVG_TEXT_ELEMENTS: ReadonlySet<string> = new Set(["text", "tspan", "title", "desc"])


/**
 * Geometry, paint and typography. No `on*` handler, no `style` (handled
 * separately), no `href` (handled separately), nothing that names a resource.
 * No `class` either: it would let a diagram borrow the page's own stylesheet,
 * and a root `<svg class="fixed inset-0 z-50">` would lay itself over the app.
 */
export const SVG_PLAIN_ATTRIBUTES: ReadonlySet<string> = new Set([
  "id", "viewBox", "preserveAspectRatio", "transform",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy",
  "width", "height", "d", "points", "pathLength",
  "dx", "dy", "rotate", "textLength", "lengthAdjust",
  "fill", "fill-opacity", "fill-rule", "clip-rule",
  "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
  "opacity", "color", "visibility", "display",
  "font-family", "font-size", "font-weight", "font-style", "font-variant",
  "text-anchor", "dominant-baseline", "alignment-baseline", "baseline-shift",
  "letter-spacing", "word-spacing", "text-decoration", "writing-mode",
  "offset", "stop-color", "stop-opacity",
  "gradientUnits", "gradientTransform", "spreadMethod",
  "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "orient",
  "clipPathUnits", "patternUnits", "patternContentUnits", "patternTransform",
  "marker-start", "marker-mid", "marker-end", "clip-path",
  "vector-effect", "shape-rendering", "text-rendering",
])


/** Presentation properties a `style` attribute may set. */
const STYLE_PROPERTIES = new Set([
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
  "stroke-miterlimit", "opacity", "color", "visibility", "display",
  "font-family", "font-size", "font-weight", "font-style", "font-variant",
  "text-anchor", "dominant-baseline", "letter-spacing", "word-spacing",
  "text-decoration", "stop-color", "stop-opacity",
  "marker-start", "marker-mid", "marker-end", "clip-path",
])

const MAX_ID_LENGTH = 128
const LOCAL_URL = /^url\(\s*(['"]?)#([A-Za-z_][\w.:-]*)\1\s*\)$/
/** Anything that could leave the document or reach script. */
const DANGEROUS_VALUE = /javascript:|vbscript:|data:|expression\(|@import|behaviou?r:|-moz-binding/i
/**
 * Every `(` must follow one of these names. Colour, maths and transform
 * functions only: an unknown function could be a resource (`src()`,
 * `image-set()`) or one the browser learns later. `url` is allowed here and
 * then held to a whole-value local reference.
 */
const ALLOWED_FUNCTIONS = new Set([
  "", "url",
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color",
  "calc", "min", "max", "clamp",
  "matrix", "translate", "translatex", "translatey", "scale", "scalex", "scaley",
  "rotate", "skewx", "skewy",
])
const FUNCTION_NAME = /([^\s(),:;'"]*)\(/g


/** True when `name` is an element a static drawing may contain. */
export function isAllowedSvgElement(name: string): boolean {
  return SVG_ALLOWED_ELEMENTS.has(name)
}


/** The id referenced by a whole-value `url(#id)`, or null when it is not one. */
function localReferenceIn(value: string): string | null {
  const match = LOCAL_URL.exec(value.trim())
  return match ? match[2] : null
}


/** True when a geometry/paint/font value cannot reach script or leave the drawing. */
function isSafeValue(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 4096) return false
  // CSS escapes and comments let a value spell one thing and mean another:
  // `u\72l(https://…)` is `url(https://…)` to the browser. Refuse, don't decode.
  if (value.includes("\\") || value.includes("/*")) return false
  if (DANGEROUS_VALUE.test(value.replace(/\s+/g, ""))) return false
  for (const [, name] of value.matchAll(FUNCTION_NAME)) {
    if (!ALLOWED_FUNCTIONS.has(name.toLowerCase())) return false
  }
  // A url() is only acceptable as a whole-value reference to a local id.
  return !/url\s*\(/i.test(value) || localReferenceIn(value) !== null
}


/**
 * Decide one attribute: the value to keep, or null to drop it. `href` survives
 * only as a fragment pointing inside this drawing, and only on `<use>`.
 */
export function sanitizeSvgAttribute(element: string, name: string, value: string): string | null {
  if (typeof name !== "string" || typeof value !== "string") return null
  const lower = name.toLowerCase()
  if (lower.startsWith("on")) return null

  if (lower === "href" || lower === "xlink:href") {
    if (element !== "use") return null
    return /^#[A-Za-z_][\w.:-]*$/.test(value.trim()) ? value.trim() : null
  }
  if (lower === "style") return sanitizeSvgStyle(value)
  if (!SVG_PLAIN_ATTRIBUTES.has(name)) return null
  if (name === "id" && (value.length > MAX_ID_LENGTH || !/^[A-Za-z_][\w.:-]*$/.test(value))) return null
  return isSafeValue(value) ? value : null
}


/**
 * Keep only allowlisted presentation properties from a `style` attribute, each
 * value held to the attribute rules. Returns null when nothing survives.
 */
export function sanitizeSvgStyle(style: string): string | null {
  if (typeof style !== "string" || style.length > 4096) return null
  const kept: string[] = []
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":")
    if (colon < 0) continue
    const property = declaration.slice(0, colon).trim().toLowerCase()
    const value = declaration.slice(colon + 1).trim()
    if (!STYLE_PROPERTIES.has(property) || !value) continue
    if (value.includes("{") || value.includes("}") || value.includes("<")) continue
    if (!isSafeValue(value)) continue
    kept.push(`${property}: ${value}`)
  }
  return kept.length > 0 ? kept.join("; ") : null
}


/** Per-instance id: ids are page-global, so two drawings' `#arrow` must not collide. */
export function prefixSvgId(prefix: string, id: string): string {
  return `${prefix}-${id}`
}


/** Rewrite an id, or every local reference inside a value, to the instance prefix. */
export function rewriteSvgReferences(prefix: string, name: string, value: string): string {
  const lower = name.toLowerCase()
  if (lower === "id") return prefixSvgId(prefix, value)
  if (lower === "href" || lower === "xlink:href") {
    return value.startsWith("#") ? `#${prefixSvgId(prefix, value.slice(1))}` : value
  }
  return value.replace(
    /url\(\s*(['"]?)#([A-Za-z_][\w.:-]*)\1\s*\)/g,
    (_match, _quote, id: string) => `url(#${prefixSvgId(prefix, id)})`,
  )
}


export const MAX_SVG_SOURCE_LENGTH = 20_000

/**
 * The contract's own pattern (gb.surface.v1 SVGPreview.svg), so the renderer
 * and the server agree on what an SVG document is. A comment body cannot
 * contain `-->`, which keeps matching linear.
 */
const SVG_DOCUMENT_START = /^\s*(<\?xml[^>]*\?>\s*)?(<!--(?:[^-]|-(?!->))*-->\s*)*<[sS][vV][gG][\s>/]/


/**
 * Cheap screening before parsing: one SVG document, no DOCTYPE or entities
 * (entity expansion is how a few hundred bytes become gigabytes). Returns the
 * reason it was refused, or null when it may be parsed.
 */
export function screenSvgSource(source: unknown): string | null {
  if (typeof source !== "string") return "SVG source is missing"
  // The contract bounds code points, as Python's len() counts them.
  if (source.length === 0 || codePointLength(source) > MAX_SVG_SOURCE_LENGTH) {
    return "SVG source is empty or too large"
  }
  if (/<!\s*(doctype|entity)/i.test(source)) return "SVG declarations are not allowed"
  if (!SVG_DOCUMENT_START.test(source)) return "Source is not an SVG document"
  return null
}


/** Length in code points (astral characters count once), short-circuited when small. */
function codePointLength(value: string): number {
  if (value.length <= MAX_SVG_SOURCE_LENGTH) return value.length
  // A code point is at most two UTF-16 units, so past twice the cap it is over.
  if (value.length > MAX_SVG_SOURCE_LENGTH * 2) return value.length
  return Array.from(value).length
}
