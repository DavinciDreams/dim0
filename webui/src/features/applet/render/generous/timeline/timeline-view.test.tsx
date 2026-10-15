import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Timeline } from "../lazy"

import { TimelineView } from "./timeline-view"


afterEach(cleanup)


const EVENTS = [
  {
    id: "opening",
    title: "The museum opens",
    description: "Opened to the public in 1819 with 311 Spanish paintings.\nThe second line.",
    start: { year: 1819, month: 11, day: 19 },
    importance: 5,
    category: "Institution",
    media: { url: "https://example.org/prado.jpg", caption: "The building", credit: "Archive" },
    link: { url: "https://example.org/history", label: "History" },
  },
  { id: "meninas", title: "Las Meninas", start: { year: 1656 }, importance: 4, category: "Painting", tags: ["Velázquez"] },
  { id: "war", title: "Collection evacuated", start: { year: 1936 }, end: { year: 1939 }, importance: 3, category: "Institution", link: { url: "javascript:alert(1)" } },
]


function card(id: string): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(`button[data-event-id="${id}"]`)
  if (!el) throw new Error(`no card ${id}`)
  return el
}


describe("<Timeline> picture timeline", () => {
  it("draws a card per event with its formatted date, eras and an accessible list", () => {
    render(<TimelineView title="Prado" events={EVENTS} eras={[{ title: "Restoration", start: { year: 1874 }, end: { year: 1931 } }]} />)
    expect(card("opening").getAttribute("aria-label")).toBe("The museum opens, 19 Nov 1819")
    expect(card("war").getAttribute("aria-label")).toBe("Collection evacuated, 1936 – 1939")
    expect(screen.getAllByText("Restoration").length).toBeGreaterThan(0)
    const list = screen.getByRole("list", { name: "Prado events" })
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent?.split(":")[0])).toEqual(["1656", "19 Nov 1819", "1936 – 1939", "Era Restoration"])
    expect(document.querySelector('[data-slot="timeline"]')?.getAttribute("data-capture-ready")).toBeTruthy()
  })

  it("shows a hover preview with the summary", () => {
    render(<TimelineView events={EVENTS} />)
    expect(screen.queryByRole("tooltip")).toBeNull()
    fireEvent.pointerEnter(card("opening"))
    const tip = screen.getByRole("tooltip")
    expect(tip.textContent).toContain("The museum opens")
    expect(tip.textContent).toContain("19 Nov 1819")
    expect(tip.textContent).toContain("Opened to the public")
    expect(card("opening").getAttribute("aria-describedby")).toBe(tip.id)
    fireEvent.pointerLeave(card("opening"))
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("opens details on click with a safe read-more link", () => {
    render(<TimelineView events={EVENTS} />)
    fireEvent.click(card("opening"))
    const dialog = screen.getByRole("dialog", { name: "The museum opens" })
    const link = within(dialog).getByRole("link", { name: /History/ })
    expect(link.getAttribute("href")).toBe("https://example.org/history")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    expect(within(dialog).getByRole("img").getAttribute("src")).toBe("https://example.org/prado.jpg")
    expect(dialog.textContent).toContain("The building")
    expect(dialog.textContent).toContain("Archive")
    expect(dialog.textContent).toContain("The second line.")

    // A javascript: link is never rendered.
    fireEvent.click(within(dialog).getByRole("button", { name: "Next event" }))
    const next = screen.getByRole("dialog", { name: "Collection evacuated" })
    expect(within(next).queryByRole("link")).toBeNull()
    expect(document.querySelector('a[href^="javascript"]')).toBeNull()
  })

  it("moves between events with the arrow keys, opens with Enter and closes with Escape", async () => {
    render(<TimelineView events={EVENTS} />)
    const first = card("meninas")
    expect(first.tabIndex).toBe(0)
    act(() => first.focus())
    fireEvent.keyDown(first, { key: "ArrowRight" })
    await waitFor(() => expect(document.activeElement?.getAttribute("data-event-id")).toBe("opening"))
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" })
    await waitFor(() => expect(document.activeElement?.getAttribute("data-event-id")).toBe("war"))
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" })
    await waitFor(() => expect(document.activeElement?.getAttribute("data-event-id")).toBe("opening"))
    expect(card("opening").tabIndex).toBe(0)
    expect(card("meninas").tabIndex).toBe(-1)

    fireEvent.keyDown(document.activeElement!, { key: "Enter" })
    const dialog = screen.getByRole("dialog", { name: "The museum opens" })
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("Close details"))
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    await waitFor(() => expect(document.activeElement?.getAttribute("data-event-id")).toBe("opening"))
  })

  it("filters by category chip and re-lays out the cards", () => {
    render(<TimelineView events={EVENTS} />)
    expect(document.querySelectorAll("button[data-event-id]")).toHaveLength(3)
    fireEvent.click(screen.getByRole("button", { name: "Painting" }))
    expect([...document.querySelectorAll("button[data-event-id]")].map((b) => b.getAttribute("data-event-id"))).toEqual(["meninas"])
    fireEvent.change(screen.getByRole("searchbox", { name: "Search events" }), { target: { value: "nothing matches" } })
    expect(screen.getByText("No events match the filters.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(document.querySelectorAll("button[data-event-id]")).toHaveLength(3)
  })

  it("zooms with the controls", () => {
    render(<TimelineView events={EVENTS} />)
    const status = () => document.querySelector('[aria-live="polite"]')!.textContent ?? ""
    const before = status()
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(status()).not.toBe(before)
    fireEvent.click(screen.getByRole("button", { name: "Fit all events" }))
    expect(status()).toBe(before)
  })

  it("renders hostile text as text and drops unsafe media", () => {
    const hostile = '<img src=x onerror="alert(1)">'
    render(<TimelineView events={[{ id: "x", title: hostile, description: hostile, start: { year: 2000 }, media: { url: "data:image/png;base64,AA" } }]} />)
    expect(card("x").getAttribute("aria-label")).toBe(`${hostile}, 2000`)
    expect(document.querySelector('img[src^="data:"]')).toBeNull()
    expect(document.querySelector("img[onerror]")).toBeNull()
  })

  it("accepts spreadsheet input directly", () => {
    render(<TimelineView table={{ columns: ["Name", "Year"], rows: [["Owain", "c. 1359"]], map: { title: "Name", start: "Year" } }} />)
    expect(card("row-0").getAttribute("aria-label")).toBe("Owain, c. 1359")
  })

  it("says so when nothing is dated", () => {
    render(<TimelineView events={[{ id: "a", title: "No date" }]} />)
    expect(screen.getByText("No dated events to show.")).toBeTruthy()
  })
})


describe("<Timeline> dispatcher", () => {
  it("keeps the legacy list for { date, title } events", () => {
    render(<Timeline events={[{ date: "Q1", title: "Alpha", description: "First" }]} />)
    expect(screen.getByText("Q1")).toBeTruthy()
    expect(screen.getByText("Alpha")).toBeTruthy()
    expect(document.querySelector('[data-slot="timeline"]')).toBeNull()
  })

  it("lazy-loads the picture timeline for the contract shape", async () => {
    render(<Timeline events={EVENTS} />)
    expect(await screen.findByRole("region", { name: /Timeline: drag to pan/ }, { timeout: 15_000 })).toBeTruthy()
  }, 30_000)
})


describe("<Timeline> TimelineJS props", () => {
  it("renders the legacy TimelineJS shape through the shared normalizer", () => {
    render(<TimelineView data={{ events: [{ unique_id: "t", start_date: { year: 1950, month: 10 }, text: { headline: "Turing <i>Test</i>" } }] }} />)
    expect(card("t").getAttribute("aria-label")).toBe("Turing Test, Oct 1950")
  })
})
