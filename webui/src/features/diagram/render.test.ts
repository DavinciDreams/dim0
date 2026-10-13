import { describe, expect, it } from "vitest"

import { renderDiagram, renderDiagramSource } from "./render"
import type { DiagramSpec } from "./schema"


const architecture: DiagramSpec = {
  diagram_type: "architecture",
  meta: { title: "Web App" },
  components: [
    { id: "web", type: "frontend", label: "Web Client", sublabel: "React SPA" },
    { id: "api", type: "backend", label: "API Server", sublabel: "FastAPI" },
    { id: "db", type: "database", label: "PostgreSQL" },
    { id: "cache", type: "database", label: "Redis" },
    { id: "queue", type: "messagebus", label: "Job Queue" },
    { id: "worker", type: "backend", label: "Worker" },
  ],
  boundaries: [{ kind: "region", label: "Cloud VPC", wraps: ["api", "db", "cache", "queue", "worker"] }],
  connections: [
    { from: "web", to: "api", label: "HTTPS" },
    { from: "api", to: "db", label: "SQL" },
    { from: "api", to: "cache" },
    { from: "api", to: "queue", label: "enqueue", variant: "dashed" },
    { from: "queue", to: "worker" },
  ],
}


const sequence: DiagramSpec = {
  diagram_type: "sequence",
  meta: { title: "Login" },
  participants: [
    { id: "user", type: "external", label: "User" },
    { id: "app", type: "frontend", label: "App" },
    { id: "auth", type: "security", label: "Auth Service" },
  ],
  messages: [
    { id: "submit", from: "user", to: "app", label: "submit credentials" },
    { id: "verify", from: "app", to: "auth", label: "verify", variant: "security" },
    { id: "token", from: "auth", to: "app", label: "JWT", variant: "return" },
    { id: "done", from: "app", to: "user", label: "signed in", variant: "return" },
  ],
  activations: [{ participant: "auth", from: "verify", to: "token" }],
}


const workflow: DiagramSpec = {
  diagram_type: "workflow",
  meta: { title: "Order Fulfilment" },
  lanes: [
    { id: "shop", label: "Storefront" },
    { id: "ops", label: "Operations" },
  ],
  nodes: [
    { id: "order", lane: "shop", col: 0, type: "frontend", label: "Place Order" },
    { id: "pay", lane: "shop", col: 1, type: "security", label: "Payment" },
    { id: "pick", lane: "ops", col: 2, type: "backend", label: "Pick & Pack" },
    { id: "ship", lane: "ops", col: 3, type: "cloud", label: "Ship" },
  ],
  edges: [
    { from: "order", to: "pay" },
    { from: "pay", to: "pick", label: "paid" },
    { from: "pick", to: "ship" },
  ],
}


describe("renderDiagram", () => {
  it("renders an auto-laid-out architecture with its labels", () => {
    const r = renderDiagram(architecture)
    if (!r.ok) throw new Error(r.error)
    expect(r.svg).toContain("<svg")
    for (const label of ["Web Client", "API Server", "PostgreSQL", "Job Queue", "Cloud VPC"]) expect(r.svg).toContain(label)
    expect(r.width).toBeGreaterThan(0)
    expect(r.height).toBeGreaterThan(0)
  })

  it("renders a grid-placed architecture", () => {
    const r = renderDiagram({
      diagram_type: "architecture",
      meta: { title: "Grid" },
      components: [
        { id: "a", type: "frontend", label: "Alpha", row: 0, col: 0 },
        { id: "b", type: "backend", label: "Beta", row: 0, col: 1 },
        { id: "c", type: "database", label: "Gamma", row: 1, col: 1 },
      ],
      connections: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    })
    if (!r.ok) throw new Error(r.error)
    expect(r.svg).toContain("Gamma")
  })

  it("renders a sequence without authored y values", () => {
    const r = renderDiagram(sequence)
    if (!r.ok) throw new Error(r.error)
    for (const label of ["User", "Auth Service", "submit credentials", "JWT"]) expect(r.svg).toContain(label)
  })

  it("renders a workflow", () => {
    const r = renderDiagram(workflow)
    if (!r.ok) throw new Error(r.error)
    for (const label of ["Storefront", "Place Order", "Pick &amp; Pack", "paid"]) expect(r.svg).toContain(label)
  })

  it("rejects an unknown diagram_type with the allowed values", () => {
    const r = renderDiagram({ diagram_type: "pie", meta: { title: "x" } } as unknown as DiagramSpec)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/"architecture", "sequence", "workflow"/)
  })

  it("reports schema errors with a path pointing at the bad field", () => {
    const r = renderDiagram({
      diagram_type: "architecture",
      meta: { title: "Bad" },
      components: [{ id: "api", type: "server", label: "API" }],
    } as unknown as DiagramSpec)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('/components/0 (id "api")/type')
  })

  it("reports dangling references", () => {
    const r = renderDiagram({ ...workflow, edges: [{ from: "order", to: "nowhere" }] } as DiagramSpec)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('edges[0] to "nowhere" is not a known id')
  })

  it("surfaces Archify layout errors readably", () => {
    const r = renderDiagram({
      diagram_type: "architecture",
      meta: { title: "Overlap" },
      components: [
        { id: "a", type: "frontend", label: "A", pos: [40, 80] },
        { id: "b", type: "backend", label: "B", pos: [60, 90] },
      ],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Components "a" and "b" are less than 8px apart/)
  })

  it("reports invalid JSON content", () => {
    const r = renderDiagramSource("{ not json")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/not valid JSON/)
  })
})
