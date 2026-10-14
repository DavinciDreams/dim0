// gb.surface.v1 fixtures for the translator tests. `researchBoard` is Galaxy
// Brain's shared contract fixture (contracts/fixtures/research-board.valid.json)
// with its bindings already materialized; `everyType` exercises all 17 catalog
// types with props shaped like the contract's examples.

import type { GalaxySurfaceSpec, SurfaceComponent } from "../surface-types"


/** Galaxy Brain's research-board fixture, verbatim. */
export function researchBoard(): GalaxySurfaceSpec {
  return {
    schema: "gb.surface.v1",
    catalog: { id: "generous.a2ui", version: "1" },
    surfaceUpdate: {
      surfaceId: "research-board",
      components: [
        { id: "board", component: { Column: { align: "stretch" } }, children: ["board-title", "board-stats", "experiment-table"] },
        { id: "board-title", parentId: "board", component: { Title: { text: "Research Board", usageHint: "h1" } } },
        {
          id: "board-stats",
          parentId: "board",
          component: {
            StatsDisplay: {
              id: "research-stats",
              title: "Research activity",
              stats: [{ key: "running", label: "Running experiments", value: 1, format: { kind: "number", decimals: 0 } }],
            },
          },
        },
        {
          id: "experiment-table",
          parentId: "board",
          component: {
            DataTable: {
              data: {
                title: "Experiments",
                columns: [
                  { id: "title", header: "Experiment", accessorKey: "title" },
                  { id: "status", header: "Status", accessorKey: "status" },
                ],
                rows: [{ title: "Parser reliability", status: "running" }],
              },
              options: { enableSorting: true, enablePagination: false, striped: true },
            },
          },
        },
      ],
    },
    bindings: [
      {
        id: "experiment-rows",
        target: { componentId: "experiment-table", prop: "data.rows" },
        source: { kind: "galaxy.eln.experiment", query: { status: "running" } },
      },
      {
        id: "activity-stats",
        target: { componentId: "board-stats", prop: "stats" },
        source: { kind: "galaxy.eln.experiment", query: { aggregate: "status" } },
      },
    ],
  }
}


/** One component of every catalog type, nested Card › Grid › …, in a root Column. */
export function everyTypeComponents(): SurfaceComponent[] {
  return [
    {
      id: "root",
      component: { Column: { distribution: "start" } },
      children: ["title", "heading", "intro", "badges", "sep", "card", "grid", "table", "chart", "timeline", "graph", "notes", "diagram"],
    },
    { id: "title", component: { Title: { text: "Lab overview" } } },
    { id: "heading", component: { Heading: { text: "This week", usageHint: "h3" } } },
    { id: "intro", component: { Text: { text: "Plain prose about the week." } } },
    { id: "badges", component: { Row: { distribution: "spaceBetween", align: "center" } }, children: ["b1", "b2"] },
    { id: "b1", component: { Badge: { text: "running", variant: "filled" } } },
    { id: "b2", component: { Badge: { text: "late", variant: "destructive" } } },
    { id: "sep", component: { Separator: { orientation: "horizontal" } } },
    { id: "card", component: { Card: {} }, children: ["stack"] },
    { id: "stack", component: { Stack: { align: "start" } }, children: ["md-text"] },
    { id: "md-text", component: { Text: { text: "Some **bold** claims", usageHint: "body" } } },
    { id: "grid", component: { Grid: { columns: 3, gap: "2" } }, children: ["stats"] },
    {
      id: "stats",
      component: {
        StatsDisplay: {
          id: "kpis",
          title: "KPIs",
          description: "Rolling 7 days",
          stats: [
            { key: "rev", label: "Revenue", value: 12345.6, format: { kind: "currency", currency: "USD", decimals: 0 }, diff: { value: 12.34, decimals: 1 } },
            { key: "conv", label: "Conversion", value: 0.0425, format: { kind: "percent", decimals: 1 }, diff: { value: -2, upIsPositive: false, label: "vs last week" } },
            { key: "users", label: "Users", value: 15300, format: { kind: "number", compact: true, decimals: 1 }, sparkline: { data: [1, 3, 2, 5] } },
          ],
        },
      },
    },
    {
      id: "table",
      component: {
        DataTable: {
          data: {
            title: "Runs",
            columns: [
              { id: "name", header: "Name", accessorKey: "name" },
              { id: "score", header: "Score", accessorKey: "score", align: "right", enableSorting: true },
            ],
            rows: [
              { name: "alpha", score: 0.91, extra: "dropped" },
              { name: "beta", score: 0.72 },
            ],
          },
          options: { enablePagination: true, pageSize: 5, compact: true },
        },
      },
    },
    {
      id: "chart",
      component: {
        Charts: {
          data: {
            title: "Throughput",
            type: "line",
            series: [
              { name: "A", data: [{ x: "Mon", y: 1 }, { x: "Tue", y: 3 }] },
              { name: "B", data: [{ x: "Tue", y: 2 }, { x: "Wed", y: 4 }] },
            ],
          },
          options: { height: 300, showLegend: false },
        },
      },
    },
    {
      id: "timeline",
      component: {
        Timeline: {
          data: {
            events: [
              { unique_id: "e1", start_date: { year: 2026, month: 3, day: 9 }, text: { headline: "Kickoff", text: "Started" } },
              { display_date: "Spring", text: { headline: "Pilot" } },
            ],
          },
        },
      },
    },
    {
      id: "graph",
      component: {
        KnowledgeGraph: {
          title: "Claims",
          data: {
            entities: [
              { id: "h1", label: "Hypothesis 1", type: "concept" },
              { id: "p1", label: "Ada", type: "person" },
              { id: "d1", label: "Paper", type: "document" },
            ],
            relationships: [
              { id: "r1", source: "p1", target: "h1", type: "proposes" },
              { id: "r2", source: "d1", target: "h1", type: "contradicts", bidirectional: true },
            ],
          },
          options: { layout: "force", showTypes: true },
        },
      },
    },
    { id: "notes", component: { Markdown: { data: { title: "Notes", content: "# Heading\n\n- one\n- two" }, options: { mode: "preview" } } } },
    {
      id: "diagram",
      component: { SVGPreview: { svg: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', title: "Contour", width: 320 } },
    },
  ]
}


/** Wrap components in a gb.surface.v1 envelope. */
export function surface(components: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "gb.surface.v1",
    catalog: { id: "generous.a2ui", version: "1" },
    surfaceUpdate: { surfaceId: "fixture", components },
    bindings: [],
    ...extra,
  }
}
