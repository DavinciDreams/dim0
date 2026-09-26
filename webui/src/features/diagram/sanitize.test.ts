import { describe, expect, it } from "vitest"

import { sanitizeSvg, scopeSvgIds } from "./sanitize"


describe("sanitizeSvg", () => {
  it("strips scripts, event handlers and foreignObject but keeps diagram markup", () => {
    const dirty = `<svg viewBox="0 0 100 100" onload="alert(1)">
      <script>alert(2)</script>
      <foreignObject><div onclick="alert(3)">x</div></foreignObject>
      <rect class="c-backend" x="1" y="1" width="10" height="10" onclick="alert(4)"/>
      <text class="t-primary" x="5" y="5">API</text>
    </svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toMatch(/script|onload|onclick|foreignObject|alert/i)
    expect(clean).toContain('class="c-backend"')
    expect(clean).toContain(">API</text>")
  })

  it("drops links and inline styles", () => {
    const clean = sanitizeSvg(`<svg><a href="javascript:alert(1)"><text>x</text></a><g style="background:url(//evil)"/></svg>`)
    expect(clean).not.toMatch(/javascript|href|style=/)
  })
})


describe("scopeSvgIds", () => {
  it("prefixes ids and every reference to them", () => {
    const svg = `<svg aria-labelledby="t d"><title id="t">x</title><desc id="d">y</desc><marker id="arrowhead"/><path marker-end="url(#arrowhead)"/></svg>`
    const scoped = scopeSvgIds(svg, "node:1")
    expect(scoped).toContain('id="node_1-arrowhead"')
    expect(scoped).toContain("url(#node_1-arrowhead)")
    expect(scoped).toContain('aria-labelledby="node_1-t node_1-d"')
  })
})
