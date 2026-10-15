// Legible text on a coloured band. A theme token's concrete colour depends on the
// active theme, so it is resolved through the shared DOM probe (cached per theme)
// and parsed; an explicit #RRGGBB is computed directly. Either way the text is
// black or white, whichever has the higher WCAG contrast.

import { useMemo } from "react"

import { useTheme } from "@/components/theme-provider"
import { resolveToken } from "@/lib/theme/resolve-token"

import { hexInk, inkFor, isPaletteToken, parseCssColor, type Ink } from "./colors"


/** A function giving the ink for a checked colour (palette token or #RRGGBB). */
export function useInk(): (color: string) => Ink {
  const { resolvedTheme, themeId } = useTheme()
  return useMemo(() => {
    const theme = `${themeId}:${resolvedTheme}`
    const cache = new Map<string, Ink>()
    return (color: string): Ink => {
      const direct = hexInk(color)
      if (direct) return direct
      const key = `${theme}|${color}`
      const hit = cache.get(key)
      if (hit) return hit
      let ink: Ink = "white"
      if (isPaletteToken(color)) {
        const rgb = parseCssColor(resolveToken(color))
        if (rgb) ink = inkFor(rgb)
      }
      cache.set(key, ink)
      return ink
    }
  }, [resolvedTheme, themeId])
}
