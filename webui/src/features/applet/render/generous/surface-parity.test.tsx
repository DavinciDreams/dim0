// Render tests for the applet components added / extended for gb.surface.v1
// parity: Badge, Separator, SVGPreview, and the additive Table / Stats props.

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { validateApplet } from "@/features/applet/compile"
import { COMPONENTS } from "@/features/applet/registry"

import { COMPONENT_IMPLS } from "../components"
import { AppletRenderer } from "../renderer"
import { drawingFrom } from "./svg-drawing"


vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))


afterEach(() => {
  document.body.innerHTML = ""
})


/** Render an SVGPreview applet whose `svg` comes from data (so no escaping fuss). */
function renderSvg(svg: string, extra = "") {
  const source = `<Widget data={{ s: ${JSON.stringify(svg)} }}><SVGPreview svg={s} ${extra} /></Widget>`
  return render(<AppletRenderer source={source} />)
}


describe("registry", () => {
  it("COMPONENTS and COMPONENT_IMPLS stay in sync", () => {
    expect([...COMPONENTS].sort()).toEqual(Object.keys(COMPONENT_IMPLS).sort())
  })

  it("the new components pass the author-time validator", () => {
    const source = `
      <Widget data={{ rows: [{ a: 1 }] }}>
        <div>
          <Badge variant="outline">ok</Badge>
          <Badge text="also" />
          <Separator />
          <Separator orientation="vertical" />
          <SVGPreview svg={"<svg viewBox='0 0 4 4'><rect width='4' height='4'/></svg>"} title="Box" width={200} />
          <Table columns={[{ key: "a", label: "A", align: "right" }]} rows={rows} title="T" striped compact bordered pageSize={5} cellFormat="readable" emptyText="none" />
        </div>
      </Widget>`
    expect(validateApplet(source)).toEqual({ ok: true })
  })
})


describe("<Badge> / <Separator>", () => {
  it("renders badge text from children or the text prop, guarding the variant", () => {
    render(<AppletRenderer source={`<Widget><div><Badge variant="destructive">Late</Badge><Badge text="Draft" variant="bogus" /></div></Widget>`} />)
    expect(screen.getByText("Late").dataset.slot).toBe("badge")
    expect(screen.getByText("Draft").dataset.slot).toBe("badge")
  })

  it("renders horizontal and vertical separators", () => {
    const { container } = render(
      <AppletRenderer source={`<Widget><div><Separator /><Separator orientation="vertical" decorative={false} /></div></Widget>`} />,
    )
    const seps = container.querySelectorAll('[data-slot="separator"]')
    expect(seps.length).toBe(2)
    expect(seps[0].getAttribute("data-orientation")).toBe("horizontal")
    expect(seps[1].getAttribute("data-orientation")).toBe("vertical")
    expect(seps[1].getAttribute("role")).toBe("separator")
  })
})


describe("<SVGPreview>", () => {
  it("rebuilds an allowlisted drawing, prefixing ids and local references", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20">
      <defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient>
      <marker id="m" markerWidth="4" markerHeight="4"><path d="M0 0 L4 2 L0 4z"/></marker></defs>
      <rect width="40" height="20" fill="url(#g)" style="stroke: blue; position: fixed"/>
      <line x1="0" y1="0" x2="10" y2="10" marker-end="url(#m)"/>
      <use href="#m"/>
      <text x="2" y="12">Hello &amp; bye</text>
    </svg>`
    const { container } = renderSvg(svg, `title="Gradient"`)
    await waitFor(() => expect(container.querySelector("svg")).toBeTruthy())
    const drawing = container.querySelector("svg")!
    expect(drawing.getAttribute("viewBox")).toBe("0 0 40 20")
    expect(drawing.hasAttribute("width")).toBe(false)
    const gradientId = container.querySelector("linearGradient")!.getAttribute("id")!
    expect(gradientId).toMatch(/^svg.+-g$/)
    expect(container.querySelector("rect")!.getAttribute("fill")).toBe(`url(#${gradientId})`)
    expect(container.querySelector("rect")!.getAttribute("style")).toBe("stroke: blue")
    expect(container.querySelector("use")!.getAttribute("href")).toMatch(/^#svg.+-m$/)
    expect(container.querySelector("text")!.textContent).toBe("Hello & bye")
    expect(screen.getByText("Gradient").tagName).toBe("FIGCAPTION")
    expect(container.querySelector('[data-slot="svg-preview"]')!.getAttribute("data-capture-ready")).toBe("true")
  })

  it("drops scripts, handlers, foreign content, external refs and classes", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" class="fixed inset-0" onload="alert(1)">
      <script>alert(1)</script>
      <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
      <image href="https://tracker.example/p.png"/>
      <a href="javascript:alert(1)"><circle r="2"/></a>
      <circle r="3" onclick="alert(1)" fill="url(https://tracker.example/x.svg#a)"/>
      <use href="https://evil.example/x.svg#a"/>
    </svg>`
    const { container } = renderSvg(svg)
    await waitFor(() => expect(container.querySelector("svg")).toBeTruthy())
    const drawing = container.querySelector("svg")!
    expect(drawing.hasAttribute("class")).toBe(false)
    expect(drawing.hasAttribute("onload")).toBe(false)
    for (const tag of ["script", "foreignObject", "image", "a", "div"]) expect(drawing.querySelector(tag)).toBeNull()
    const circle = drawing.querySelector("circle")!
    expect(circle.hasAttribute("onclick")).toBe(false)
    expect(circle.hasAttribute("fill")).toBe(false)
    expect(drawing.querySelector("use")!.hasAttribute("href")).toBe(false)
    expect(container.innerHTML).not.toMatch(/alert|tracker|javascript/)
  })

  it("refuses declarations and non-SVG sources with an inline notice", async () => {
    renderSvg(`<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg>&a;</svg>`)
    expect((await screen.findByRole("alert")).textContent).toMatch(/declarations are not allowed/)
  })

  it("survives malformed props without throwing", async () => {
    const { container } = render(<AppletRenderer source={`<Widget><SVGPreview svg={42} width={"9999999px; x"} /></Widget>`} />)
    expect((await screen.findByRole("alert")).textContent).toMatch(/missing/)
    expect(container.querySelector('[data-slot="svg-preview"]')!.getAttribute("style")).toBeNull()
  })

  it("draws hand-written SVG that omits xmlns", () => {
    const drawing = drawingFrom('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', "p")
    expect(typeof drawing).not.toBe("string")
    expect((drawing as SVGElement).querySelector("circle")?.getAttribute("r")).toBe("4")
  })

  it("drawingFrom reports unreadable XML", () => {
    expect(drawingFrom("<svg><g></svg>", "p")).toBe("SVG could not be read")
  })
})


describe("<Table> additive props", () => {
  const rows = `[{ n: "a", ok: true, tags: ["x", "y"], meta: { label: "M" }, v: null }, { n: "b", ok: false, tags: [], meta: { a: 1, b: 2 }, v: 3 }, { n: "c", ok: true, tags: [], meta: {}, v: 4 }]`

  it("formats readable cells, aligns columns and shows a title", () => {
    render(
      <AppletRenderer
        source={`<Widget data={{ rows: ${rows} }}><Table title="Runs" cellFormat="readable" columns={[{ key: "n", label: "Name" }, { key: "ok" }, "tags", "meta", { key: "v", align: "right" }]} rows={rows} /></Widget>`}
      />,
    )
    expect(screen.getByText("Runs")).toBeTruthy()
    expect(screen.getAllByText("Yes").length).toBe(2)
    expect(screen.getByText("No")).toBeTruthy()
    expect(screen.getByText("x · y")).toBeTruthy()
    expect(screen.getByText("M")).toBeTruthy()
    expect(screen.getByText("A: 1 · B: 2")).toBeTruthy()
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
    expect(screen.getByText("3").className).toContain("text-right")
  })

  it("keeps plain formatting by default (backward compatible)", () => {
    render(<AppletRenderer source={`<Widget data={{ rows: [{ a: true, b: null }] }}><Table columns={["a", "b"]} rows={rows} /></Widget>`} />)
    expect(screen.getByText("true")).toBeTruthy()
  })

  it("paginates with pageSize", () => {
    render(<AppletRenderer source={`<Widget data={{ rows: ${rows} }}><Table columns={["n"]} rows={rows} pageSize={2} /></Widget>`} />)
    expect(screen.getAllByRole("row").length).toBe(3)
    expect(screen.getByText("1 / 2")).toBeTruthy()
    fireEvent.click(screen.getByText("Next"))
    expect(screen.getByText("c")).toBeTruthy()
    expect(screen.getAllByRole("row").length).toBe(2)
  })

  it("shows emptyText and tolerates junk rows and columns", () => {
    render(<AppletRenderer source={`<Widget data={{ rows: [null, 3] }}><Table columns={[null, { label: "x" }, "a"]} rows={rows} emptyText="Nothing yet" /></Widget>`} />)
    expect(screen.getByText("Nothing yet")).toBeTruthy()
  })
})


describe("<Stats> changeDecimals", () => {
  it("fixes the change to the given decimals", () => {
    render(<AppletRenderer source={`<Widget data={{ s: [{ label: "Conv", value: "4%", change: 12, changeDecimals: 1 }] }}><Stats stats={s} /></Widget>`} />)
    expect(screen.getByText(/▲ 12\.0%/)).toBeTruthy()
  })
})
