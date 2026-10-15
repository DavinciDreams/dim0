// Timeline colours: the contract's colour type (a theme palette name or an
// explicit `#RRGGBB`), the category → colour assignment shared with Generous, and a
// WCAG contrast pick of black/white text for a filled band. Pure — the runtime
// half (resolving a theme token to a concrete colour) lives in the view.


export const PALETTE_TOKENS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "primary", "secondary", "muted", "accent", "destructive"] as const

export type PaletteToken = (typeof PALETTE_TOKENS)[number]

const TOKEN_SET: ReadonlySet<string> = new Set(PALETTE_TOKENS)
const HEX = /^#[0-9a-fA-F]{6}$/
const RAMP: PaletteToken[] = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]

/** Text colour on a filled band. */
export type Ink = "black" | "white"


export function isPaletteToken(color: string): color is PaletteToken {
  return TOKEN_SET.has(color)
}


/** A checked colour as a CSS value: a token becomes `var(--token)`, a hex stays itself. */
export function cssColor(color: string): string {
  return isPaletteToken(color) ? `var(--${color})` : color
}


/** `color` mixed toward `base` (a CSS colour) at `percent` strength. */
export function tint(color: string, percent: number, base = "var(--card)"): string {
  return `color-mix(in oklab, ${cssColor(color)} ${percent}%, ${base})`
}


/**
 * Fixed hues for categories past the five chart tokens. Same values as Generous
 * (timeline-histropedia.ts), so a sixth category looks the same in both apps.
 */
const EXTRA_CATEGORY_COLORS = ["#c2417a", "#8d6e4c", "#4f7cac", "#9c4fc2", "#5c8a3a"]
const CATEGORY_PALETTE: string[] = [...RAMP, ...EXTRA_CATEGORY_COLORS]


/** The colour for the nth category: chart-1…chart-5, then the fixed hues, cycling. */
export function categoryColorAt(index: number): string {
  return CATEGORY_PALETTE[((index % CATEGORY_PALETTE.length) + CATEGORY_PALETTE.length) % CATEGORY_PALETTE.length]
}


/**
 * Category → colour, in order of first appearance in the data (as Generous does),
 * so the same data always gets the same colours. Blank / missing categories are skipped.
 */
export function categoryColors(categories: Iterable<string | undefined>): Map<string, string> {
  const out = new Map<string, string>()
  for (const c of categories) if (c && !out.has(c)) out.set(c, categoryColorAt(out.size))
  return out
}


type Rgb = [number, number, number]


function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}


/** Linear-light sRGB → gamma-encoded sRGB channel. */
function encode(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}


/** OKLab → sRGB (0–1, gamma-encoded, clamped). */
function oklabToRgb(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    clamp01(encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ]
}


/** A CSS number or percentage (`0.7`, `70%`) scaled so 100% = `full`. */
function num(token: string, full: number): number {
  return token.endsWith("%") ? (parseFloat(token) / 100) * full : parseFloat(token)
}


/**
 * Parse a concrete CSS colour as computed by a browser — `#rrggbb`, `rgb()/rgba()`,
 * `color(srgb …)`, `oklch()`, `oklab()` — into gamma-encoded sRGB 0–1. Null otherwise.
 */
export function parseCssColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase()
  const hex = /^#([0-9a-f]{6})$/.exec(s)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }
  const fn = /^([a-z]+)\((.*)\)$/.exec(s)
  if (!fn) return null
  const parts = fn[2].replace(/\/.*$/, "").replace(/,/g, " ").trim().split(/\s+/)
  const nums = (tokens: string[], full: number) => tokens.map((t) => num(t, full))
  const ok = (values: number[]) => values.length === 3 && values.every(Number.isFinite)
  switch (fn[1]) {
    case "rgb":
    case "rgba": {
      const v = nums(parts.slice(0, 3), 255).map((c) => clamp01(c / 255)) as Rgb
      return ok(v) ? v : null
    }
    case "color": {
      if (parts[0] !== "srgb") return null
      const v = nums(parts.slice(1, 4), 1).map(clamp01) as Rgb
      return ok(v) ? v : null
    }
    case "oklab": {
      const [L, a, b] = [num(parts[0] ?? "", 1), num(parts[1] ?? "", 0.4), num(parts[2] ?? "", 0.4)]
      return ok([L, a, b]) ? oklabToRgb(L, a, b) : null
    }
    case "oklch": {
      const [L, C, H] = [num(parts[0] ?? "", 1), num(parts[1] ?? "", 0.4), parseFloat(parts[2] ?? "")]
      if (!ok([L, C, Number.isFinite(H) ? H : 0])) return null
      const h = ((Number.isFinite(H) ? H : 0) * Math.PI) / 180
      return oklabToRgb(L, C * Math.cos(h), C * Math.sin(h))
    }
  }
  return null
}


/** WCAG relative luminance of a gamma-encoded sRGB colour. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}


/** WCAG contrast ratio between two luminances. */
export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}


/** Black or white text, whichever contrasts more with `background`. */
export function inkFor(background: Rgb): Ink {
  const l = relativeLuminance(background)
  return contrastRatio(l, 0) >= contrastRatio(l, 1) ? "black" : "white"
}


/** Ink for an explicit `#RRGGBB` colour (null for a token — resolved at runtime). */
export function hexInk(color: string): Ink | null {
  if (!HEX.test(color)) return null
  return inkFor(parseCssColor(color)!)
}


const FONT_STACK = {
  sans: "var(--font-sans)",
  serif: "var(--font-serif)",
  mono: "var(--font-mono)",
  script: "var(--font-handwriting)",
  display: "var(--font-informal)",
} as const


/** A card font name → one of the app's bundled font stacks (no web fonts are added). */
export function fontStack(font: keyof typeof FONT_STACK | undefined): string | undefined {
  return font ? FONT_STACK[font] : undefined
}
