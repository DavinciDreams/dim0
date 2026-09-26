import { describe, expect, it } from "vitest"

import { renderDiagramSource } from "@/features/diagram/render"

import { SKILLS } from "./index"


// `\r?\n`: Windows checkouts with core.autocrlf read the skill with CRLF endings.
const jsonBlocks = (md: string): string[] => [...md.matchAll(/```json\r?\n([\s\S]*?)```/g)].map((m) => m[1])


describe("learn_generate_architecture_diagram skill", () => {
  const blocks = jsonBlocks(SKILLS.learn_generate_architecture_diagram)

  it("ships one example per diagram type", () => {
    const types = blocks.map((b) => (JSON.parse(b) as { diagram_type: string }).diagram_type)
    expect(types).toEqual(["architecture", "sequence", "workflow"])
  })

  it.each([0, 1, 2])("example %i renders (the agent copies these shapes)", (i) => {
    const r = renderDiagramSource(blocks[i])
    if (!r.ok) throw new Error(r.error)
    expect(r.svg).toContain("<svg")
  })
})
