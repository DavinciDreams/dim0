// Ported from Galaxy Brain's scripts/surface-svg-policy.test.mjs: the same cases,
// so this policy and Galaxy Brain's stay provably identical.

import { describe, expect, it } from "vitest"

import {
  isAllowedSvgElement,
  rewriteSvgReferences,
  sanitizeSvgAttribute,
  sanitizeSvgStyle,
  screenSvgSource,
} from "./svg-policy"


describe("svg policy (gb.surface.v1 SVGPreview parity)", () => {
  it("only inert drawing elements are allowed", () => {
    for (const name of ["svg", "g", "path", "circle", "text", "tspan", "marker", "linearGradient", "use"]) {
      expect(isAllowedSvgElement(name), name).toBe(true)
    }
    for (const name of ["script", "foreignObject", "iframe", "image", "a", "animate", "set", "style", "feImage", "SCRIPT"]) {
      expect(isAllowedSvgElement(name), name).toBe(false)
    }
  })

  it("event handlers never survive, whatever their case", () => {
    for (const name of ["onclick", "onload", "onLoad", "ONMOUSEOVER", "onbegin"]) {
      expect(sanitizeSvgAttribute("rect", name, "alert(1)"), name).toBeNull()
    }
  })

  it("href survives only as a local fragment on <use>", () => {
    expect(sanitizeSvgAttribute("use", "href", "#arrow")).toBe("#arrow")
    expect(sanitizeSvgAttribute("use", "xlink:href", " #arrow ")).toBe("#arrow")
    expect(sanitizeSvgAttribute("use", "href", "https://evil.example/x.svg#a")).toBeNull()
    expect(sanitizeSvgAttribute("use", "href", "javascript:alert(1)")).toBeNull()
    expect(sanitizeSvgAttribute("use", "href", "data:image/svg+xml,<svg/>")).toBeNull()
    expect(sanitizeSvgAttribute("rect", "href", "#arrow")).toBeNull()
    expect(sanitizeSvgAttribute("text", "xlink:href", "#x")).toBeNull()
  })

  it("paint may reference only ids inside the drawing", () => {
    expect(sanitizeSvgAttribute("rect", "fill", "url(#grad)")).toBe("url(#grad)")
    expect(sanitizeSvgAttribute("rect", "fill", "url('#grad')")).toBe("url('#grad')")
    expect(sanitizeSvgAttribute("path", "marker-end", "url(#arrow)")).toBe("url(#arrow)")
    expect(sanitizeSvgAttribute("rect", "fill", "url(https://tracker.example/p.svg#g)")).toBeNull()
    expect(sanitizeSvgAttribute("rect", "fill", "url(data:image/png;base64,AAAA)")).toBeNull()
    expect(sanitizeSvgAttribute("rect", "fill", "red url(#a)")).toBeNull()
    expect(sanitizeSvgAttribute("rect", "fill", "#3b82f6")).toBe("#3b82f6")
    expect(sanitizeSvgAttribute("rect", "fill", "rgb(59, 130, 246)")).toBe("rgb(59, 130, 246)")
  })

  it("escaped and spaced script schemes are still caught", () => {
    for (const value of ["javascript:alert(1)", "java\\script:alert(1)", "JaVaScRiPt:x", "java script:x", "\\6a avascript:x"]) {
      expect(sanitizeSvgAttribute("rect", "fill", value), value).toBeNull()
    }
  })

  it("escaped or disguised external references are refused, not decoded", () => {
    const disguised = [
      String.raw`u\72l(https://example.com/paint.svg#g)`,
      String.raw`\75rl(https://example.com/paint.svg#g)`,
      String.raw`u\000072 l(https://example.com/paint.svg#g)`,
      String.raw`u\rl(https://example.com/paint.svg#g)`,
      String.raw`url(\68ttps://example.com/paint.svg#g)`,
      "u/**/rl(https://example.com/paint.svg#g)",
      "URL(https://example.com/paint.svg#g)",
      "url (https://example.com/paint.svg#g)",
      "src(https://example.com/paint.svg#g)",
      "image-set('https://example.com/p.png' 1x)",
      "-webkit-image-set(url(https://example.com/p.png) 1x)",
      "var(--page-token)",
    ]
    for (const value of disguised) {
      expect(sanitizeSvgAttribute("rect", "fill", value), `attribute: ${value}`).toBeNull()
      expect(sanitizeSvgStyle(`fill: ${value}`), `style: ${value}`).toBeNull()
      expect(sanitizeSvgStyle(`stroke: blue; fill: ${value}`), `mixed style: ${value}`).toBe("stroke: blue")
    }
  })

  it("ordinary colour, maths and transform functions still draw", () => {
    for (const [name, value] of [
      ["fill", "hsl(210 80% 50% / 0.5)"],
      ["stroke", "oklch(0.7 0.1 200)"],
      ["stroke-width", "calc(2px + 1px)"],
      ["transform", "translate(10, 20) rotate(45 5 5) scale(2) skewX(10)"],
      ["transform", "matrix(1 0 0 1 10 10)"],
      ["font-family", "'Helvetica Neue', Arial, sans-serif"],
    ]) {
      expect(sanitizeSvgAttribute("rect", name, value), `${name}: ${value}`).toBe(value)
    }
  })

  it("unknown and resource-naming attributes are dropped", () => {
    for (const name of ["class", "src", "action", "formaction", "xmlns:ev", "requiredExtensions", "attributeName"]) {
      expect(sanitizeSvgAttribute("rect", name, "x"), name).toBeNull()
    }
  })

  it("ids must be plain identifiers", () => {
    expect(sanitizeSvgAttribute("marker", "id", "arrow-head_1")).toBe("arrow-head_1")
    expect(sanitizeSvgAttribute("marker", "id", "1bad")).toBeNull()
    expect(sanitizeSvgAttribute("marker", "id", "a b")).toBeNull()
    expect(sanitizeSvgAttribute("marker", "id", "x".repeat(200))).toBeNull()
  })

  it("style keeps allowlisted presentation and nothing else", () => {
    expect(sanitizeSvgStyle("fill: red; stroke-width: 2")).toBe("fill: red; stroke-width: 2")
    expect(sanitizeSvgStyle("fill: red; position: fixed; top: 0")).toBe("fill: red")
    expect(sanitizeSvgStyle("background: url(https://tracker.example/p.png)")).toBeNull()
    expect(sanitizeSvgStyle("fill: url(https://tracker.example/p.svg#g)")).toBeNull()
    expect(sanitizeSvgStyle("fill: url(#grad)")).toBe("fill: url(#grad)")
    expect(sanitizeSvgStyle("fill: expression(alert(1))")).toBeNull()
    expect(sanitizeSvgStyle("fill: red } body { display: none")).toBeNull()
    expect(sanitizeSvgStyle("behavior: url(x.htc)")).toBeNull()
    expect(sanitizeSvgStyle("")).toBeNull()
  })

  it("references are rewritten to the instance prefix", () => {
    expect(rewriteSvgReferences("s1", "id", "arrow")).toBe("s1-arrow")
    expect(rewriteSvgReferences("s1", "href", "#arrow")).toBe("#s1-arrow")
    expect(rewriteSvgReferences("s1", "marker-end", "url(#arrow)")).toBe("url(#s1-arrow)")
    expect(rewriteSvgReferences("s1", "style", "fill: url('#g'); stroke: blue")).toBe("fill: url(#s1-g); stroke: blue")
    expect(rewriteSvgReferences("s1", "fill", "#ff0000")).toBe("#ff0000")
  })

  it("source screening refuses declarations and non-SVG documents", () => {
    expect(screenSvgSource('<svg viewBox="0 0 10 10"><circle r="4"/></svg>')).toBeNull()
    expect(screenSvgSource('<?xml version="1.0"?>\n<svg></svg>')).toBeNull()
    expect(screenSvgSource("<!-- diagram -->\n<svg></svg>")).toBeNull()
    expect(screenSvgSource('<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg>&a;</svg>')).not.toBeNull()
    expect(screenSvgSource("<html><svg></svg></html>")).not.toBeNull()
    expect(screenSvgSource("<svgx></svgx>")).not.toBeNull()
    expect(screenSvgSource("")).not.toBeNull()
    expect(screenSvgSource("x".repeat(20_001))).not.toBeNull()
    expect(screenSvgSource(42)).not.toBeNull()
    expect(screenSvgSource('<?XML version="1.0"?><svg></svg>')).not.toBeNull()
  })

  it("source screening counts code points, as the contract does", () => {
    const drawing = (body: string) => `<svg>${body}</svg>`
    expect(screenSvgSource(drawing("😀".repeat(19_989)))).toBeNull()
    expect(screenSvgSource(drawing("😀".repeat(19_990)))).not.toBeNull()
  })

  it("source screening stays linear on stacked comments", () => {
    for (const source of ["<!---->".repeat(2_800) + "x", "<!--" + "-".repeat(19_000), "<!--<!--".repeat(2_400) + "x"]) {
      const started = performance.now()
      expect(screenSvgSource(source)).not.toBeNull()
      expect(performance.now() - started).toBeLessThan(250)
    }
    expect(screenSvgSource("<!---->\n".repeat(2_000) + "<svg/>")).toBeNull()
  })
})
