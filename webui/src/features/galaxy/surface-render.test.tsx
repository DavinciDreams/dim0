// End-to-end: a translated gb.surface.v1 surface renders through the real applet
// renderer. MarkdownView (streamdown) is stubbed — it is too slow to boot under
// jsdom and has its own coverage; everything else is the production component.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppletRenderer } from "@/features/applet/render"

import { everyTypeComponents, researchBoard, surface } from "./__fixtures__/surfaces"
import { surfaceToApplet } from "./surface-to-applet"


vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))
vi.mock("@/components/markdown/markdown-view", () => ({
  MarkdownView: ({ content, omitImages }: { content: string; omitImages?: boolean }) => (
    <div data-testid="markdown" data-omit-images={String(omitImages)}>
      {content}
    </div>
  ),
}))


afterEach(cleanup)


describe("translated surfaces render", () => {
  it("renders Galaxy Brain's research board", () => {
    render(<AppletRenderer source={surfaceToApplet(researchBoard()).source} />)
    expect(screen.getByRole("heading", { level: 1, name: "Research Board" })).toBeTruthy()
    expect(screen.getByText("Research activity")).toBeTruthy()
    expect(screen.getByText("Running experiments")).toBeTruthy()
    const table = screen.getByRole("table")
    expect(within(table).getByText("Experiment")).toBeTruthy()
    expect(within(table).getByText("Parser reliability")).toBeTruthy()
    expect(screen.queryByText(/Applet error/)).toBeNull()
  })

  it("renders every catalog type without an applet error", async () => {
    const { container } = render(<AppletRenderer source={surfaceToApplet(surface(everyTypeComponents())).source} />)
    expect(screen.queryByText(/Applet error/)).toBeNull()
    expect(screen.getByRole("heading", { level: 2, name: "Lab overview" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 3, name: "This week" })).toBeTruthy()
    expect(screen.getByText("Plain prose about the week.").tagName).toBe("P")
    expect(screen.getByText("running").dataset.slot).toBe("badge")
    expect(container.querySelector('[data-slot="separator"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="card"]')).toBeTruthy()
    expect(screen.getByText("$12,346")).toBeTruthy()
    expect(screen.getByText(/▲ 12\.3%/)).toBeTruthy()
    expect(screen.getByText("alpha")).toBeTruthy()
    expect(screen.getByText("Kickoff")).toBeTruthy()
    expect(screen.getByText("2026-03-09")).toBeTruthy()
    expect(screen.getByText("3 entities · 2 relationships")).toBeTruthy()
    const markdown = await screen.findAllByTestId("markdown")
    expect(markdown.map((m) => m.dataset.omitImages)).toEqual(["true", "true"])
    await waitFor(() => expect(container.querySelector('[data-slot="svg-preview"] circle')).toBeTruthy())
    expect(screen.getByText("Contour").tagName).toBe("FIGCAPTION")
  })

  it("renders the refusal notice for a non-surface", () => {
    render(<AppletRenderer source={surfaceToApplet({ nope: true }).source} />)
    expect(screen.getByText(/This surface cannot be shown: the surface spec is not an object|unsupported surface schema/)).toBeTruthy()
  })

  it("shows hostile text verbatim, never as markup", () => {
    const hostile = '</h2><img src=x onerror="alert(1)"><b>{set("x", 1)}</b>'
    const { container } = render(
      <AppletRenderer source={surfaceToApplet(surface([{ id: "t", component: { Title: { text: hostile } } }])).source} />,
    )
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(hostile)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("b")).toBeNull()
  })
})
