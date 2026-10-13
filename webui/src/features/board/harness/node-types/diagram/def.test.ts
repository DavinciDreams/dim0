import { describe, expect, it } from "vitest"

import { diagramDef } from "./def"


describe("diagram node-type def", () => {
  it("declares type 'diagram' with a React view and a placeholder", () => {
    expect(diagramDef.type).toBe("diagram")
    expect(typeof diagramDef.view).toBe("function")
    expect(typeof diagramDef.drawPlaceholder).toBe("function")
  })

  it("renders React above the LOD threshold, placeholder below", () => {
    expect(diagramDef.lod?.minZoomForReact).toBeGreaterThan(diagramDef.lod?.minZoomForPlaceholder ?? 0)
  })
})
