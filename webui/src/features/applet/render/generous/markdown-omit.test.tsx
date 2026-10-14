// The applet <Markdown omitImages> forwards the flag to the shared MarkdownView.
// MarkdownView itself (streamdown) is too slow to boot under jsdom, so it is
// stubbed here; the swap it performs is its component map's `img` entry.

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppletRenderer } from "../renderer"


vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))
vi.mock("@/components/markdown/markdown-view", () => ({
  MarkdownView: ({ content, omitImages }: { content: string; omitImages?: boolean }) => (
    <div data-testid="md" data-omit={String(omitImages)}>
      {content}
    </div>
  ),
}))


afterEach(cleanup)


describe("<Markdown omitImages>", () => {
  it("forwards omitImages to MarkdownView", async () => {
    render(<AppletRenderer source={`<Widget><Markdown content={"![a](https://x.example/a.png)"} omitImages /></Widget>`} />)
    expect((await screen.findByTestId("md")).dataset.omit).toBe("true")
  })

  it("defaults to showing images", async () => {
    render(<AppletRenderer source={`<Widget><Markdown content={"hi"} /></Widget>`} />)
    expect((await screen.findByTestId("md")).dataset.omit).toBe("false")
  })
})
