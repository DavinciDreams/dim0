import { describe, expect, it } from "vitest"

import { compileApplet, validateApplet } from "@/features/applet/compile"
import type { AppletTree, ElNode, JsonValue, Node } from "@/features/applet/tree"

import { everyTypeComponents, legacyTimelineProps, neutralTimelineProps, researchBoard, surface, tableTimelineProps } from "./__fixtures__/surfaces"
import { formatStatValue } from "./surface-adapters"
import { SURFACE_REF_KEY, readSurfaceRef, surfaceToApplet } from "./surface-to-applet"
import { SURFACE_COMPONENT_TYPES, type SurfaceRef } from "./surface-types"


/** Translate, assert the output passes the write_note gate, and return it compiled. */
function translate(spec: unknown, ref?: SurfaceRef) {
  const result = surfaceToApplet(spec, ref)
  const validation = validateApplet(result.source)
  if (!validation.ok) throw new Error(`invalid applet: ${validation.message}\n---\n${result.source}`)
  const compiled = compileApplet(result.source)
  if (!compiled.ok) throw new Error(compiled.message)
  return { ...result, tree: compiled.tree }
}


/** Every element node in document order. */
function elements(node: Node | undefined, out: ElNode[] = []): ElNode[] {
  if (!node) return out
  if (node.k === "el") {
    out.push(node)
    node.children?.forEach((c) => elements(c, out))
  } else if (node.k === "cond") {
    elements(node.then, out)
    elements(node.else, out)
  } else if (node.k === "list") {
    elements(node.tpl, out)
  }
  return out
}


function tags(tree: AppletTree): string[] {
  return elements(tree.root).map((e) => e.tag)
}


/** The literal text child of an element (`{"…"}`), if it has one. */
function literalText(el: ElNode): string | undefined {
  const child = el.children?.[0]
  if (!child || child.k !== "txt") return undefined
  if (child.v !== undefined) return child.v
  return child.x?.type === "Literal" ? String(child.x.value) : undefined
}


/** The value an element's prop resolves to: a literal prop, or a `dN` / `dN.key` binding into data. */
function propValue(tree: AppletTree, el: ElNode, name: string): JsonValue | undefined {
  if (el.props && name in el.props) return el.props[name]
  const expr = el.bind?.[name]
  if (!expr) return undefined
  const data = tree.scopes.data ?? {}
  if (expr.type === "Identifier") return data[expr.name]
  if (expr.type === "MemberExpression") {
    const m = expr as unknown as { object: { name: string }; property: { name: string } }
    return (data[m.object.name] as Record<string, JsonValue>)[m.property.name]
  }
  return undefined
}


function first(tree: AppletTree, tag: string): ElNode {
  const el = elements(tree.root).find((e) => e.tag === tag)
  if (!el) throw new Error(`no <${tag}>`)
  return el
}


const REF: SurfaceRef = { surfaceId: "srf_42", version: 7, title: "Research" }


describe("surfaceToApplet — Galaxy Brain's research-board fixture", () => {
  const { tree, warnings, source } = translate(researchBoard(), REF)

  it("translates cleanly into a valid applet", () => {
    expect(warnings).toEqual([])
    expect(source.startsWith("<Widget data={{")).toBe(true)
  })

  it("keeps the tree: Column › Title, StatsDisplay, DataTable", () => {
    expect(tags(tree)).toEqual(["div", "div", "h1", "div", "h3", "Stats", "Card", "Table"])
    expect(literalText(first(tree, "h1"))).toBe("Research Board")
    expect(first(tree, "div").children).toHaveLength(1)
  })

  it("adapts the table and stats props", () => {
    const table = first(tree, "Table")
    expect(propValue(tree, table, "columns")).toEqual([
      { key: "title", label: "Experiment" },
      { key: "status", label: "Status" },
    ])
    expect(propValue(tree, table, "rows")).toEqual([{ title: "Parser reliability", status: "running" }])
    expect(table.props).toMatchObject({ title: "Experiments", sortable: true, striped: true, cellFormat: "readable" })
    expect(propValue(tree, first(tree, "Stats"), "stats")).toEqual([{ label: "Running experiments", value: "1" }])
  })

  it("embeds the surface ref and reads it back", () => {
    expect(tree.scopes.data?.[SURFACE_REF_KEY]).toEqual({ surfaceId: "srf_42", version: 7, title: "Research" })
    expect(readSurfaceRef(source)).toEqual(REF)
  })
})


describe("surfaceToApplet — every catalog type", () => {
  const { tree, warnings } = translate(surface(everyTypeComponents()), REF)
  const all = elements(tree.root)

  it("covers all 17 types in the fixture", () => {
    const types = new Set(everyTypeComponents().map((c) => Object.keys(c.component)[0]))
    expect([...types].sort()).toEqual([...SURFACE_COMPONENT_TYPES].sort())
    expect(warnings).toEqual([])
  })

  it("maps each type to its Dim-0 component or intrinsic", () => {
    const t = tags(tree)
    for (const tag of ["Badge", "Separator", "Card", "Stats", "Table", "Chart", "Timeline", "Graph", "Markdown", "SVGPreview"]) {
      expect(t, tag).toContain(tag)
    }
    expect(literalText(first(tree, "h2"))).toBe("Lab overview") // Title → h2 by default
    expect(all.filter((e) => e.tag === "h3").map(literalText)).toContain("This week") // Heading usageHint h3
    expect(all.find((e) => e.tag === "p" && literalText(e) === "Plain prose about the week.")).toBeTruthy()
  })

  it("adapts layout props to Tailwind classes", () => {
    const row = all.find((e) => String(e.props?.className).includes("flex-wrap"))!
    expect(row.props?.className).toBe("flex flex-wrap gap-3 justify-between items-center")
    const grid = all.find((e) => String(e.props?.className).startsWith("grid"))!
    expect(grid.props?.className).toBe("grid grid-cols-3 gap-2")
    expect(first(tree, "Card").props?.className).toBe("gap-3 p-5")
  })

  it("maps badge variants (filled → default)", () => {
    const badges = all.filter((e) => e.tag === "Badge")
    expect(badges.map((b) => [b.props?.variant, literalText(b)])).toEqual([
      ["default", "running"],
      ["destructive", "late"],
    ])
  })

  it("renders markdown-looking Text through Markdown without images", () => {
    const md = all.filter((e) => e.tag === "Markdown")
    expect(md[0].props).toEqual({ content: "Some **bold** claims", omitImages: true })
    expect(propValue(tree, md[1], "content")).toBe("# Heading\n\n- one\n- two")
  })

  it("formats stats and carries diffs as changes", () => {
    expect(propValue(tree, first(tree, "Stats"), "stats")).toEqual([
      { label: "Revenue", value: "$12,346", change: 12.34, changeDecimals: 1 },
      { label: "Conversion", value: "4.3%", change: -2, changeDecimals: 1, changeLabel: "vs last week", goodDirection: "down" },
      { label: "Users", value: "15.3K", sparkline: [1, 3, 2, 5] },
    ])
  })

  it("projects table rows onto visible columns and honours pagination", () => {
    const table = first(tree, "Table")
    expect(propValue(tree, table, "rows")).toEqual([
      { name: "alpha", score: 0.91 },
      { name: "beta", score: 0.72 },
    ])
    expect(propValue(tree, table, "columns")).toEqual([
      { key: "name", label: "Name" },
      { key: "score", label: "Score", align: "right" },
    ])
    expect(table.props).toMatchObject({ pageSize: 5, compact: true, sortable: true })
  })

  it("builds an aligned Chart.js config from Generous series", () => {
    const chart = first(tree, "Chart")
    expect(chart.props).toMatchObject({ type: "line", height: 300, options: { plugins: { legend: { display: false } } } })
    expect(propValue(tree, chart, "data")).toEqual({
      labels: ["Mon", "Tue", "Wed"],
      datasets: [
        { label: "A", data: [1, 3, null] },
        { label: "B", data: [null, 2, 4] },
      ],
    })
  })

  it("maps legacy TimelineJS events to the library-neutral timeline", () => {
    const timeline = first(tree, "Timeline")
    expect(propValue(tree, timeline, "events")).toEqual([
      { id: "e1", title: "Kickoff", description: "Started", start: { year: 2026, month: 3, day: 9, precision: "day" } },
      { id: "event-1", title: "Pilot", start: { year: 2026, month: 4, precision: "month" }, dateLabel: "Spring" },
    ])
    expect(propValue(tree, timeline, "eras")).toEqual([])
  })

  it("maps the knowledge graph (type colors, dashed contested links, both directions)", () => {
    const graph = first(tree, "Graph")
    expect(graph.props).toMatchObject({ layout: "force", directed: true })
    expect(propValue(tree, graph, "nodes")).toEqual([
      { id: "h1", label: "Hypothesis 1", color: "chart-1", sublabel: "concept" },
      { id: "p1", label: "Ada", color: "chart-2", sublabel: "person" },
      { id: "d1", label: "Paper", color: "chart-3", sublabel: "document" },
    ])
    expect(propValue(tree, graph, "edges")).toEqual([
      { a: "p1", b: "h1", label: "proposes" },
      { a: "d1", b: "h1", label: "contradicts", dashed: true },
      { a: "h1", b: "d1", dashed: true },
    ])
  })

  it("passes SVG source through to the sanitizing component", () => {
    const svg = first(tree, "SVGPreview")
    expect(propValue(tree, svg, "svg")).toBe('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>')
    expect(svg.props).toMatchObject({ title: "Contour", width: 320 })
  })
})


describe("surfaceToApplet — nesting", () => {
  it("orders children from `children` lists, then `parentId` links, roots in component order", () => {
    const { tree } = translate(
      surface([
        { id: "late", component: { Text: { text: "late root" } } },
        { id: "card", component: { Card: {} }, children: ["b"] },
        { id: "a", parentId: "card", component: { Text: { text: "A" } } },
        { id: "b", component: { Text: { text: "B" } } },
      ]),
    )
    const ps = elements(tree.root).filter((e) => e.tag === "p").map(literalText)
    expect(ps).toEqual(["late root", "B", "A"])
  })

  it("hoists the children of leaf components to follow them", () => {
    const { tree, warnings } = translate(
      surface([{ id: "t", component: { Timeline: { data: { events: [] } } }, children: ["x"] }, { id: "x", component: { Badge: { text: "kid" } } }]),
    )
    expect(tags(tree)).toEqual(["div", "Timeline", "Badge"])
    expect(warnings.join("\n")).toMatch(/cannot contain children/)
  })

  it("translates deep nesting", () => {
    const chain = Array.from({ length: 40 }, (_, i) => ({
      id: `n${i}`,
      component: i === 39 ? { Text: { text: "bottom" } } : { Column: {} },
      ...(i > 0 ? { parentId: `n${i - 1}` } : {}),
    }))
    const { tree } = translate(surface(chain))
    expect(elements(tree.root).filter((e) => e.tag === "div")).toHaveLength(40)
  })

  it("parses Grid track lists and clamps bad columns", () => {
    const { tree, warnings } = translate(
      surface([
        { id: "g1", component: { Grid: { columns: "repeat(4, minmax(0, 1fr))" } } },
        { id: "g2", component: { Grid: { columns: "1fr 2fr" } } },
        { id: "g3", component: { Grid: { columns: 99 } } },
        { id: "g4", component: { Grid: {} } },
      ]),
    )
    expect(elements(tree.root).slice(1).map((e) => e.props?.className)).toEqual([
      "grid grid-cols-4 gap-4",
      "grid grid-cols-2 gap-4",
      "grid grid-cols-2 gap-4",
      "grid grid-cols-2 gap-4",
    ])
    expect(warnings).toHaveLength(3)
  })
})


describe("surfaceToApplet — unknown and unsafe components", () => {
  it("drops unknown types with a warning and keeps their children in place", () => {
    const { tree, warnings } = translate(
      surface([
        { id: "root", component: { Column: {} }, children: ["mystery", "after"] },
        { id: "mystery", component: { JSX: { code: "<b/>" } }, children: ["inner"] },
        { id: "inner", component: { Text: { text: "kept" } } },
        { id: "after", component: { Text: { text: "after" } } },
      ]),
    )
    expect(elements(tree.root).filter((e) => e.tag === "p").map(literalText)).toEqual(["kept", "after"])
    expect(warnings).toEqual(['component "mystery" has unknown type "JSX"; it was not drawn'])
  })

  it("drops components carrying handlers, forbidden keys or script fragments", () => {
    const hostile = JSON.parse(`[
      { "id": "a", "component": { "Badge": { "text": "x", "onClick": "alert(1)" } } },
      { "id": "b", "component": { "Badge": { "text": "x", "__proto__": { "polluted": true } } } },
      { "id": "c", "component": { "Markdown": { "data": { "content": "[x](javascript:alert(1))" } } } },
      { "id": "d", "component": { "SVGPreview": { "svg": "<svg><script>alert(1)</script></svg>" } } },
      { "id": "e", "component": { "Badge": { "text": "x", "dangerouslySetInnerHTML": { "__html": "<b>" } } } },
      { "id": "f", "component": { "Text": { "text": "fine" } } }
    ]`)
    const { tree, warnings, source } = translate(surface(hostile))
    expect(tags(tree)).toEqual(["div", "p"])
    expect(warnings).toHaveLength(5)
    expect(source).not.toMatch(/alert|javascript|__proto__|<script|polluted/)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it("rejects components with two types, non-object props, or bad ids", () => {
    const { tags: t, warnings } = (() => {
      const r = translate(
        surface([
          { id: "two", component: { Text: { text: "a" }, Badge: { text: "b" } } },
          { id: "arr", component: { Text: ["x"] } },
          { id: "bad id!", component: { Text: { text: "x" } } },
          "not an object",
          { id: "ok", component: { Text: { text: "ok" } } },
        ]),
      )
      return { tags: tags(r.tree), warnings: r.warnings }
    })()
    expect(t).toEqual(["div", "p"])
    expect(warnings).toHaveLength(4)
  })
})


describe("surfaceToApplet — malformed input", () => {
  const notSurfaces: Array<[string, unknown, RegExp]> = [
    ["null", null, /not an object/],
    ["a string", "gb.surface.v1", /not an object/],
    ["an array", [], /not an object/],
    ["another schema", { ...surface([]), schema: "gb.surface.v2" }, /unsupported surface schema/],
    ["another catalog", { ...surface([]), catalog: { id: "x", version: "1" } }, /catalog/],
    ["no components", surface([]), /no components/],
    ["components not an array", { ...surface([]), surfaceUpdate: { components: { a: 1 } } }, /no components/],
    ["no surfaceUpdate", { schema: "gb.surface.v1", catalog: { id: "generous.a2ui", version: "1" } }, /no components/],
  ]

  it.each(notSurfaces)("refuses %s with a notice applet", (_name, spec, reason) => {
    const { tree, warnings } = translate(spec, REF)
    expect(warnings.at(-1)).toMatch(reason)
    expect(literalText(tree.root as ElNode)).toMatch(/^This surface cannot be shown: /)
    expect(tree.scopes.data?.[SURFACE_REF_KEY]).toEqual({ surfaceId: "srf_42", version: 7, title: "Research" })
  })

  it("refuses a cyclic (non-JSON) spec", () => {
    const spec = surface([{ id: "a", component: { Text: { text: "x" } } }])
    spec.self = spec
    expect(translate(spec).warnings.at(-1)).toMatch(/not serializable/)
  })

  it("cuts broken links: unknown child, unknown parent, second parent, cycles, bad children", () => {
    const { tree, warnings } = translate(
      surface([
        { id: "p1", component: { Column: {} }, children: ["x", "ghost", "x"] },
        { id: "p2", component: { Column: {} }, children: ["x"] },
        { id: "x", component: { Text: { text: "x" } } },
        { id: "orphan", parentId: "nobody", component: { Text: { text: "orphan" } } },
        { id: "c1", component: { Card: {} }, children: ["c2"] },
        { id: "c2", component: { Card: {} }, children: ["c1"] },
        { id: "bad", component: { Card: {} }, children: "x" },
        { id: "dup", component: { Text: { text: "first" } } },
        { id: "dup", component: { Text: { text: "second" } } },
      ]),
    )
    expect(elements(tree.root).filter((e) => e.tag === "p").map(literalText)).toEqual(["x", "orphan", "first"])
    const all = warnings.join("\n")
    expect(all).toMatch(/unknown child "ghost"/)
    expect(all).toMatch(/"x" has more than one parent/)
    expect(all).toMatch(/unknown parent "nobody"/)
    expect(all).toMatch(/reachable through a cycle/)
    expect(all).toMatch(/invalid children/)
    expect(all).toMatch(/duplicate component id "dup"/)
  })

  it("survives junk-shaped props for every type", () => {
    const junk: unknown[] = [null, 0, -1, "", "x", [], [null], { a: [1, { b: null }] }, true]
    const components = SURFACE_COMPONENT_TYPES.flatMap((type, i) =>
      junk.map((value, j) => ({
        id: `${type}-${i}-${j}`,
        component: { [type]: { data: value, text: value, svg: value, stats: value, columns: value, options: value, title: value, usageHint: value } },
      })),
    )
    // 17 × 9 components: also exercises the 64-component bound.
    const { warnings } = translate(surface(components))
    expect(warnings[0]).toMatch(/only the first 64/)
  })

  it("never throws or emits an invalid applet on randomized input", () => {
    let seed = 7
    const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
    const scalar = (): unknown => pick([null, true, 0, 1.5, -3, "", "a", '"}{', "</Widget>", "${x}", "{set('a',1)}", " ", "\\"])
    const value = (depth: number): unknown => {
      if (depth > 3 || rand() < 0.4) return scalar()
      if (rand() < 0.5) return Array.from({ length: Math.floor(rand() * 4) }, () => value(depth + 1))
      const keys = ["data", "text", "series", "rows", "columns", "entities", "relationships", "events", "stats", "x", "y", "value", "id", "label", "type", "source", "target", "svg", "content", "usageHint", "variant", "headline", "start_date"]
      return Object.fromEntries(Array.from({ length: Math.floor(rand() * 5) }, () => [pick(keys), value(depth + 1)]))
    }
    for (let round = 0; round < 60; round++) {
      const ids = Array.from({ length: 1 + Math.floor(rand() * 10) }, (_, i) => `c${i}`)
      const components = ids.map((id) => ({
        id,
        component: { [pick([...SURFACE_COMPONENT_TYPES, "Nope"])]: rand() < 0.9 ? value(0) : scalar() },
        ...(rand() < 0.3 ? { parentId: pick(ids) } : {}),
        ...(rand() < 0.3 ? { children: [pick(ids), pick(ids)] } : {}),
      }))
      expect(() => translate(surface(components))).not.toThrow()
    }
  })
})


describe("surfaceToApplet — escaping", () => {
  const hostile = [
    `"double" and 'single' quotes`,
    "{braces} and }{ inverted",
    "</Widget><Widget>",
    "</div></Card>",
    '{set("count", 1)}',
    "${globalThis.alert(1)}",
    "`backtick` and \\ backslash \\n",
    "line separator paragraph",
    "<!-- comment --> */ /*",
    "<img src=x onerror=alert(1)>",
    "emoji 😀 and lone surrogate \ud800",
    "{{ data }}",
    "&amp; &lt;b&gt;",
  ]

  it.each(hostile.map((s) => [s]))("round-trips %j as inert literal text", (value) => {
    const { tree, source } = translate(
      surface([
        { id: "t", component: { Title: { text: `T ${value}` } } },
        { id: "h", component: { Heading: { text: `H ${value}`, usageHint: "h4" } } },
        { id: "x", component: { Text: { text: `X ${value}` } } },
        { id: "b", component: { Badge: { text: `B ${value}` } } },
        {
          id: "tbl",
          component: {
            DataTable: { data: { title: `Tbl ${value}`, columns: [{ id: "c", header: `Col ${value}` }], rows: [{ c: `Cell ${value}` }] } },
          },
        },
        { id: "ch", component: { Charts: { data: { title: `Ch ${value}`, series: [{ name: `S ${value}`, data: [{ x: `X ${value}`, y: 1 }] }] } } } },
        { id: "kg", component: { KnowledgeGraph: { title: `KG ${value}`, data: { entities: [{ id: "e", label: `E ${value}`, type: "custom" }], relationships: [] } } } },
        { id: "sv", component: { SVGPreview: { svg: "<svg/>", title: `SV ${value}` } } },
      ]),
      { surfaceId: "s", version: 1, title: `Ref ${value}` },
    )
    const all = elements(tree.root)
    expect(all.map(literalText)).toEqual(expect.arrayContaining([`T ${value}`.trim(), `H ${value}`.trim(), `B ${value}`.trim()]))
    const table = first(tree, "Table")
    expect(table.props?.title ?? propValue(tree, table, "title")).toBe(`Tbl ${value}`)
    expect(propValue(tree, table, "columns")).toEqual([{ key: "c", label: `Col ${value}` }])
    expect(propValue(tree, table, "rows")).toEqual([{ c: `Cell ${value}` }])
    expect(propValue(tree, first(tree, "Chart"), "data")).toMatchObject({ labels: [`X ${value}`], datasets: [{ label: `S ${value}` }] })
    expect(first(tree, "SVGPreview").props?.title).toBe(`SV ${value}`)
    expect(readSurfaceRef(source)?.title).toBe(`Ref ${value}`.trim())
    // Nothing but this module's own handful of tags made it into the markup.
    const allowed = ["div", "h2", "h3", "h4", "p", "span", "Markdown", "Badge", "Card", "Table", "Chart", "Graph", "SVGPreview"]
    expect(tags(tree).filter((t) => !allowed.includes(t))).toEqual([])
    expect(all.some((e) => e.on)).toBe(false)
  })

  it("never lets a string terminate its literal (no handlers or extra elements appear)", () => {
    const value = '"}><button onClick={set("x", 1)}>pwn</button><p a={"'
    const { tree } = translate(surface([{ id: "t", component: { Title: { text: value } } }]))
    expect(tags(tree)).toEqual(["div", "h2"])
    expect(literalText(first(tree, "h2"))).toBe(value)
    expect(elements(tree.root).some((e) => e.on)).toBe(false)
  })
})


describe("surfaceToApplet — bounds", () => {
  it("imports only the first 64 components", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `t${i}`, component: { Text: { text: `n${i}` } } }))
    const { tree, warnings } = translate(surface(many))
    expect(elements(tree.root).filter((e) => e.tag === "p")).toHaveLength(64)
    expect(warnings).toEqual(["the surface has 80 components; only the first 64 were imported"])
  })

  it("refuses a spec over 262,144 JSON bytes", () => {
    const big = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, component: { Text: { text: "é".repeat(19_000) } } }))
    expect(translate(surface(big)).warnings.at(-1)).toMatch(/bytes \(limit 262144\)/)
  })

  it("drops a component whose strings, depth or value count exceed the bounds", () => {
    let deep: unknown = "leaf"
    for (let i = 0; i < 12; i++) deep = { n: deep }
    const { tree, warnings } = translate(
      surface([
        { id: "long", component: { Text: { text: "x".repeat(20_001) } } },
        { id: "deep", component: { Markdown: { data: { content: "x", extra: deep } } } },
        { id: "wide", component: { DataTable: { data: { columns: [{ id: "a", header: "A" }], rows: Array.from({ length: 2100 }, (_, i) => ({ a: i })) } } } },
        { id: "nan", component: { Charts: { data: { value: Number.NaN } } } },
        { id: "ok", component: { Text: { text: "ok" } } },
      ]),
    )
    expect(tags(tree)).toEqual(["div", "p"])
    expect(warnings.map((w) => w.replace(/^component "(\w+)".*has (.*); it was not drawn$/, "$1: $2"))).toEqual([
      "long: a string over the length bound",
      "deep: nested too deeply",
      "wide: too many values",
      "nan: a non-finite number",
    ])
  })

  it("moves long text into the data scope rather than inlining it", () => {
    const { tree } = translate(surface([{ id: "x", component: { Text: { text: `# Big\n\n${"word ".repeat(400)}` } } }]))
    const md = first(tree, "Markdown")
    expect(md.props?.content).toBeUndefined()
    expect(String(propValue(tree, md, "content"))).toMatch(/^# Big/)
  })

  it("pages tables over 100 rows when the surface does not paginate", () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ a: i }))
    const { tree } = translate(surface([{ id: "t", component: { DataTable: { data: { columns: [{ id: "a", header: "A" }], rows } } } }]))
    expect(first(tree, "Table").props?.pageSize).toBe(100)
  })
})


describe("surfaceToApplet — chart adaptation", () => {
  const chart = (data: Record<string, unknown>, options?: Record<string, unknown>) => {
    const { tree, warnings } = translate(surface([{ id: "c", component: { Charts: { data, ...(options ? { options } : {}) } } }]))
    const el = elements(tree.root).find((e) => e.tag === "Chart")
    return { el, data: el ? propValue(tree, el, "data") : undefined, warnings, tree }
  }

  it("draws pie as one dataset of slices", () => {
    const r = chart({ type: "pie", series: [{ name: "Share", data: [{ x: "A", y: 2 }, { x: "B", y: 3 }] }] })
    expect(r.el?.props?.type).toBe("pie")
    expect(r.data).toEqual({ labels: ["A", "B"], datasets: [{ label: "Share", data: [2, 3] }] })
  })

  it("draws scatter with numeric x", () => {
    const r = chart({ type: "scatter", series: [{ name: "P", data: [{ x: 1.5, y: 2 }, { x: "n/a", y: 3 }] }] })
    expect(r.data).toEqual({ datasets: [{ label: "P", data: [{ x: 1.5, y: 2 }, { x: 2, y: 3 }] }] })
  })

  it("draws a gauge as a value/remaining doughnut", () => {
    const r = chart({ type: "gauge", title: "Load", value: 30, min: 0, max: 120 })
    expect(r.el?.props?.type).toBe("doughnut")
    expect(r.data).toEqual({ labels: ["Value", "Remaining"], datasets: [{ label: "Load", data: [30, 90] }] })
  })

  it("maps histogram/funnel data variants to bars and approximates the rest with a warning", () => {
    const funnel = chart({ type: "funnel", stages: [{ stage: "Visit", value: 100 }, { stage: "Buy", value: 7 }] })
    expect(funnel.el?.props?.type).toBe("bar")
    expect(funnel.data).toEqual({ labels: ["Visit", "Buy"], datasets: [{ label: "stages", data: [100, 7] }] })
    expect(funnel.warnings).toEqual([])
    const sankey = chart({ type: "sankey", sankeyNodes: [{ id: "a" }, { id: "b" }], sankeyLinks: [{ from: "a", to: "b", value: 3 }] })
    expect(sankey.el?.props?.type).toBe("line")
    expect(sankey.warnings).toEqual(['chart type "sankey" is drawn as a line chart of its data points'])
  })

  it("shows a notice instead of an empty chart", () => {
    const r = chart({ type: "bar", series: [] })
    expect(r.el).toBeUndefined()
    expect(elements(r.tree.root).map(literalText)).toContain("No point series in this snapshot.")
  })
})


describe("formatStatValue", () => {
  it("formats like Generous's StatsDisplay (fixed en-US locale)", () => {
    expect(formatStatValue("n/a", { kind: "number" })).toBe("n/a")
    expect(formatStatValue(1234.5, undefined)).toBe("1234.5")
    expect(formatStatValue(1234.5, { kind: "number" })).toBe("1,235")
    expect(formatStatValue(1234.5, { kind: "number", decimals: 2 })).toBe("1,234.50")
    expect(formatStatValue(2_500_000, { kind: "number", compact: true, decimals: 1 })).toBe("2.5M")
    expect(formatStatValue(9.5, { kind: "currency", currency: "eur" })).toBe("€9.50")
    expect(formatStatValue(9.5, { kind: "currency", currency: "not a code" })).toBe("$9.50")
    expect(formatStatValue(0.1234, { kind: "percent" })).toBe("12.34%")
    expect(formatStatValue(12, { kind: "percent", basis: "unit", decimals: 0 })).toBe("12%")
    expect(formatStatValue(null, undefined)).toBe("—")
  })
})


describe("readSurfaceRef", () => {
  it("returns null for applets without a ref, non-strings and broken source", () => {
    expect(readSurfaceRef(translate(researchBoard()).source)).toBeNull()
    expect(readSurfaceRef(42)).toBeNull()
    expect(readSurfaceRef("<Widget><div>")).toBeNull()
    expect(readSurfaceRef(`<Widget data={{ gbSurface: { surfaceId: "../x", version: 1 } }}><div /></Widget>`)).toBeNull()
    expect(readSurfaceRef(`<Widget data={{ gbSurface: { surfaceId: "x", version: 0 } }}><div /></Widget>`)).toBeNull()
  })

  it("survives the applet being edited around it", () => {
    const { source } = translate(researchBoard(), { surfaceId: "abc", version: 3 })
    const edited = source.replace('"Research Board"', '"Renamed board"')
    expect(readSurfaceRef(edited)).toEqual({ surfaceId: "abc", version: 3 })
  })

  it("refuses to record an invalid ref, with a warning", () => {
    const bad = translate(researchBoard(), { surfaceId: "has space", version: 1 })
    expect(bad.warnings).toEqual(["the surface ref has an invalid surfaceId; it was not recorded"])
    expect(readSurfaceRef(bad.source)).toBeNull()
    const badVersion = translate(researchBoard(), { surfaceId: "ok", version: 1.5 })
    expect(badVersion.warnings).toEqual(["the surface ref has an invalid version; it was not recorded"])
  })
})


describe("surfaceToApplet — Timeline in either contract shape", () => {
  const timelineOf = (props: Record<string, unknown>) => {
    const result = translate(surface([{ id: "tl", component: { Timeline: props } }]))
    const el = first(result.tree, "Timeline")
    return { ...result, el, events: propValue(result.tree, el, "events"), eras: propValue(result.tree, el, "eras") }
  }

  it("maps the legacy TimelineJS shape exactly (ids, plain text, precision, labels, safe media, group)", () => {
    const { events, el, warnings, tree } = timelineOf(legacyTimelineProps())
    expect(events).toEqual([
      {
        id: "suffrage",
        title: "Representation of the People Act",
        description: "Some women gain the vote.\nOver 30 & property owners.",
        start: { year: 1918, month: 2, day: 6, precision: "day" },
        dateLabel: "6 February 1918",
        group: "Law",
        media: { url: "https://example.org/act.png", caption: "The Act", credit: "Parliament" },
      },
      { id: "event-1", title: "Chicxulub impact", start: { year: -66000000, precision: "million-years" }, dateLabel: "66 Mya" },
      {
        id: "event-2",
        title: "Untitled",
        description: "Equal franchise",
        start: { year: 1928, month: 7, precision: "month" },
        end: { year: 1929, precision: "year" },
      },
    ])
    expect(propValue(tree, el, "height")).toBe(600)
    expect(warnings.join("\n")).toMatch(/1 timeline event\(s\) without a usable title or start date were dropped/)
  })

  it("passes the library-neutral shape through the shared normalizer", () => {
    const { events, eras, el, source } = timelineOf(neutralTimelineProps())
    const list = events as Array<Record<string, unknown>>
    expect(list.map((e) => e.id)).toEqual(["opening", "las-meninas", "war"]) // input order
    expect(list[0]).toEqual({
      id: "opening",
      title: "The museum opens",
      subtitle: "Royal Museum of Paintings",
      description: "Opened to the public with 311 Spanish paintings on show.",
      start: { year: 1819, month: 11, day: 19, precision: "day" },
      importance: 5,
      category: "Institution",
      tags: ["opening", "building"],
      media: { url: "https://example.org/prado.jpg", caption: "The Villanueva building", credit: "Example Archive" },
      link: { url: "https://example.org/history", label: "History of the Prado" },
      style: { card: "classic", font: "serif" },
    })
    expect(list[1].style).toEqual({ card: "image", color: "#7a1f2b" })
    expect(list[2]).not.toHaveProperty("link") // ftp:// is not http(s)
    expect(list[2].end).toEqual({ year: 1939, precision: "year" })
    expect(eras).toEqual([{ title: "Bourbon Restoration", start: { year: 1874, precision: "year" }, end: { year: 1931, precision: "year" }, color: "chart-3" }])
    expect(el.props).toMatchObject({ title: "Museo del Prado", height: 520 })
    // Bulky data lives in the <Widget data> scope, not inline.
    expect(el.bind?.events).toBeTruthy()
    expect(source).toContain('"events":')
  })

  it("converts table input to events", () => {
    const { events, warnings } = timelineOf(tableTimelineProps())
    expect(events).toEqual([
      {
        id: "row-0",
        title: "Owain Glyndŵr",
        start: { year: 1359, precision: "year" },
        end: { year: 1415, precision: "year" },
        dateLabel: "c. 1359",
        importance: 5,
        tags: ["rebellion", "prince"],
        media: { url: "https://example.org/owain.jpg" },
        link: { url: "https://example.org/owain" },
      },
      { id: "row-1", title: "Hywel Dda", start: { year: 880, precision: "year" }, end: { year: 950, precision: "year" }, importance: 4, tags: ["law"] },
    ])
    expect(warnings.join("\n")).toMatch(/1 timeline event\(s\) without a usable title or start date were dropped/)
  })

  it("keeps an empty timeline on the picture renderer (eras always bound)", () => {
    const { events, eras } = timelineOf({ events: [] })
    expect(events).toEqual([])
    expect(eras).toEqual([])
  })
})
