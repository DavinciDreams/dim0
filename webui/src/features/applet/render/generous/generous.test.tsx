import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { validateApplet } from "@/features/applet/compile"

import { AppletRenderer } from "../renderer"


vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))


afterEach(() => {
  document.body.innerHTML = ""
})


describe("Generous-derived applet components", () => {
  it("are accepted by the author-time validator", () => {
    const source = `
      <Widget data={{ rows: [1, 2] }}>
        <div>
          <Mermaid diagram={"graph TD; A-->B"} />
          <Latex expression={"\\\\frac{a}{b}"} />
          <Markdown content={"**hi**"} />
          <CodeBlock code={"print(1)"} language="python" />
          <JsonViewer data={{ a: 1 }} />
          <Stats stats={[{ label: "Users", value: 10 }]} />
          <ProgressTracker steps={[{ label: "Plan", status: "done" }]} />
          <Timeline events={[{ date: "2026", title: "Ship" }]} />
        </div>
      </Widget>`
    expect(validateApplet(source).ok).toBe(true)
  })

  it("renders Stats with a signed change", () => {
    render(
      <AppletRenderer
        source={`<Widget data={{ s: [{ label: "Revenue", value: "$12k", change: -4, goodDirection: "down" }] }}><Stats stats={s} /></Widget>`}
      />,
    )
    expect(screen.getByText("Revenue")).toBeTruthy()
    expect(screen.getByText("$12k")).toBeTruthy()
    expect(screen.getByText(/▼ 4%/)).toBeTruthy()
  })

  it("renders ProgressTracker and Timeline from bound data", () => {
    render(
      <AppletRenderer
        source={`
          <Widget data={{ steps: [{ label: "Design", status: "done" }, { label: "Build", status: "active" }], ev: [{ date: "Q1", title: "Alpha" }] }}>
            <div><ProgressTracker steps={steps} /><Timeline events={ev} /></div>
          </Widget>`}
      />,
    )
    expect(screen.getByText("Design")).toBeTruthy()
    expect(screen.getByText("Build")).toBeTruthy()
    expect(screen.getByText("Alpha")).toBeTruthy()
  })

  it("renders JsonViewer collapsed past expandDepth and expands on click", () => {
    render(<AppletRenderer source={`<Widget data={{ d: { outer: { inner: 42 } } }}><JsonViewer data={d} expandDepth={1} /></Widget>`} />)
    expect(screen.queryByText("42")).toBeNull()
    fireEvent.click(screen.getByText(/outer/))
    expect(screen.getByText("42")).toBeTruthy()
  })

  it("renders Latex through KaTeX without executing markup", () => {
    const { container } = render(
      <AppletRenderer source={`<Widget><Latex expression={"x^2 <img src=x onerror=alert(1)>"} /></Widget>`} />,
    )
    expect(container.querySelector(".katex")).toBeTruthy()
    expect(container.querySelector("img")).toBeNull()
  })
})
