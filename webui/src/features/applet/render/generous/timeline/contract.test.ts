// Ported from Generous's lib/a2ui/__tests__/timeline-contract.test.ts so the two
// normalizers stay in step (the Galaxy JSON-schema assertions there are left out:
// Dim-0 has no schema validator; the bounds they cover are asserted directly).

import { describe, expect, it } from "vitest"

import {
  formatEventDate,
  formatTimelineDate,
  inferPrecision,
  isLegacyTimelineProps,
  normalizeTimelineProps,
  parseTimelineDateCell,
  safeHttpUrl,
  toPlainText,
  type TimelineV2,
} from "./contract"


describe("normalizeTimelineProps: the current shape", () => {
  it("keeps every field of a well-formed timeline", () => {
    const input: TimelineV2 = {
      title: "Space",
      height: 500,
      events: [
        {
          id: "apollo-11",
          title: "Apollo 11",
          subtitle: "First crewed landing",
          description: "Armstrong and Aldrin\nwalk on the Moon.",
          start: { year: 1969, month: 7, day: 20, precision: "day" },
          end: { year: 1969, month: 7, day: 24, precision: "day" },
          dateLabel: "July 1969",
          importance: 5,
          category: "Crewed",
          group: "NASA",
          tags: ["Moon", "NASA"],
          media: { url: "https://example.com/a.jpg", caption: "Aldrin", credit: "NASA", alt: "An astronaut" },
          link: { url: "https://en.wikipedia.org/wiki/Apollo_11", label: "Read more" },
          style: { card: "rounded", color: "chart-2", font: "serif" },
        },
      ],
      eras: [{ title: "Space Race", start: { year: 1955 }, end: { year: 1975 }, category: "Crewed", color: "#336699" }],
    }
    const normalized = normalizeTimelineProps(input)
    expect(normalized.events[0]).toEqual(input.events[0])
    expect(normalized.title).toBe("Space")
    expect(normalized.height).toBe(500)
    // Precision is always stated on the way out.
    expect(normalized.eras).toEqual([{ ...input.eras![0], start: { year: 1955, precision: "year" }, end: { year: 1975, precision: "year" } }])
  })

  it("infers precision from the parts given", () => {
    const { events } = normalizeTimelineProps({
      events: [
        { id: "a", title: "Day", start: { year: 2000, month: 2, day: 3 } },
        { id: "b", title: "Month", start: { year: 2000, month: 2 } },
        { id: "c", title: "Year", start: { year: 2000 } },
        { id: "d", title: "Deep", start: { year: -66_000_000 } },
        { id: "e", title: "Stated", start: { year: -13_800_000_000, precision: "billion-years" } },
      ],
    })
    expect(events.map((event) => event.start.precision)).toEqual(["day", "month", "year", "million-years", "billion-years"])
  })

  it("drops events without a usable start, and unsafe or invalid fields", () => {
    const { events } = normalizeTimelineProps({
      events: [
        { id: "no-start", title: "Undated" },
        { id: "bad-year", title: "Bad", start: { year: "1969" } },
        { id: "too-old", title: "Old", start: { year: -20_000_000_000 } },
        {
          id: "x",
          title: "Unsafe",
          start: { year: 1969, month: 13, day: 40 },
          end: { year: "later" },
          importance: 9,
          media: { url: "javascript:alert(1)" },
          link: { url: "data:text/html,<script>alert(1)</script>" },
          style: { card: "neon", color: "red; background: url(x)", font: "comic" },
          tags: ["", "a", "a", 42],
        },
        "not an event",
        null,
      ],
    })
    expect(events).toEqual([{ id: "x", title: "Unsafe", start: { year: 1969, precision: "year" }, importance: 5, tags: ["a", "42"] }])
  })

  it("keeps a day only with its month", () => {
    const { events } = normalizeTimelineProps({ events: [{ id: "a", title: "A", start: { year: 1969, day: 20 } }] })
    expect(events[0].start).toEqual({ year: 1969, precision: "year" })
  })

  it("defaults missing ids and titles, and makes repeated ids unique", () => {
    const { events } = normalizeTimelineProps({
      events: [
        { title: "One", start: { year: 1 } },
        { id: "dup", start: { year: 2 } },
        { id: "dup", title: "Three", start: { year: 3 } },
      ],
    })
    expect(events.map(({ id, title }) => [id, title])).toEqual([
      ["event-0", "One"],
      ["dup", "Untitled"],
      ["dup-2", "Three"],
    ])
  })

  it("keeps titles as plain text: nothing is parsed as HTML", () => {
    const { events } = normalizeTimelineProps({ events: [{ id: "a", title: "  1 < 2 and <b>bold</b>  ", start: { year: 1 } }] })
    expect(events[0].title).toBe("1 < 2 and <b>bold</b>")
  })

  it("holds strings and lists to the contract bounds", () => {
    const many = Array.from({ length: 600 }, (_, index) => ({ id: `e${index}`, title: "x".repeat(400), start: { year: index } }))
    const normalized = normalizeTimelineProps({
      title: "t".repeat(600),
      height: 5000,
      events: many,
      eras: Array.from({ length: 60 }, () => ({ title: "Era", start: { year: 1 }, end: { year: 2 } })),
    })
    expect(normalized.events).toHaveLength(500)
    expect(normalized.events[0].title).toHaveLength(300)
    expect(normalized.title).toHaveLength(500)
    expect(normalized.height).toBe(1600)
    expect(normalized.eras).toHaveLength(50)
  })

  it("counts code points, not UTF-16 units, when cutting", () => {
    const { events } = normalizeTimelineProps({ events: [{ id: "a", title: "😀".repeat(400), start: { year: 1 } }] })
    expect(Array.from(events[0].title)).toHaveLength(300)
  })

  it("returns an empty timeline for anything that is not props", () => {
    for (const input of [null, undefined, "timeline", 42, [], {}, { events: "nope" }]) {
      expect(normalizeTimelineProps(input)).toEqual({ events: [] })
    }
  })

  it("prefers events when both events and table are given", () => {
    const { events } = normalizeTimelineProps({
      events: [{ id: "a", title: "From events", start: { year: 1 } }],
      table: { columns: ["t", "s"], rows: [["From table", 2]], map: { title: "t", start: "s" } },
    })
    expect(events.map((event) => event.title)).toEqual(["From events"])
  })
})


describe("normalizeTimelineProps: the legacy TimelineJS shape", () => {
  it("maps slides to events with the shared rules", () => {
    const normalized = normalizeTimelineProps({
      data: {
        title: { text: { headline: "<b>History</b> of AI" } },
        events: [
          {
            unique_id: "turing",
            start_date: { year: 1950, month: 10, display_date: "October 1950" },
            text: { headline: "Turing <i>Test</i>", text: "<p>Alan Turing asks</p><p>&quot;Can machines think?&quot;</p>" },
            media: { url: "https://example.com/turing.jpg", caption: "<em>Turing</em>", credit: "Archive" },
            group: "People",
          },
          {
            start_date: { year: 1956, month: 6, day: 18 },
            end_date: { year: 1956, month: 8, day: 17 },
            display_date: "Summer 1956",
            text: { headline: "Dartmouth workshop" },
          },
          { start_date: { year: -66_000_000 }, text: { headline: "Dinosaurs end" } },
          { text: { headline: "Undated" } },
          { start_date: { year: 2000 }, media: { url: "javascript:alert(1)" } },
        ],
        eras: [{ start_date: { year: 1950 }, end_date: { year: 1974 }, text: { headline: "<b>Early</b> AI" } }],
      },
      options: { height: 600 },
    })

    expect(normalized).toEqual({
      title: "History of AI",
      height: 600,
      events: [
        {
          id: "turing",
          title: "Turing Test",
          description: 'Alan Turing asks\n"Can machines think?"',
          start: { year: 1950, month: 10, precision: "month" },
          dateLabel: "October 1950",
          group: "People",
          media: { url: "https://example.com/turing.jpg", caption: "Turing", credit: "Archive" },
        },
        {
          id: "event-1",
          title: "Dartmouth workshop",
          start: { year: 1956, month: 6, day: 18, precision: "day" },
          end: { year: 1956, month: 8, day: 17, precision: "day" },
          dateLabel: "Summer 1956",
        },
        { id: "event-2", title: "Dinosaurs end", start: { year: -66_000_000, precision: "million-years" } },
        { id: "event-4", title: "Untitled", start: { year: 2000, precision: "year" } },
      ],
      eras: [{ title: "Early AI", start: { year: 1950, precision: "year" }, end: { year: 1974, precision: "year" } }],
    })
  })

  it("prefers the slide display_date over the start date one", () => {
    const { events } = normalizeTimelineProps({
      data: {
        events: [{ start_date: { year: 1, display_date: "from start" }, display_date: "from slide" }, { start_date: { year: 2, display_date: "from start" } }],
      },
    })
    expect(events.map((event) => event.dateLabel)).toEqual(["from slide", "from start"])
  })

  it("reads legacy heights given as strings and clamps them", () => {
    expect(normalizeTimelineProps({ data: { events: [] }, options: { height: "700px" } }).height).toBe(700)
    expect(normalizeTimelineProps({ data: { events: [] }, options: { height: 20 } }).height).toBe(160)
    expect(normalizeTimelineProps({ data: { events: [] }, options: { height: "80%" } }).height).toBeUndefined()
  })

  it("recognizes the legacy shape only by data.events", () => {
    expect(isLegacyTimelineProps({ data: { events: [] } })).toBe(true)
    expect(isLegacyTimelineProps({ events: [] })).toBe(false)
    expect(isLegacyTimelineProps({ data: { events: "x" } })).toBe(false)
  })
})


describe("normalizeTimelineProps: table input", () => {
  const columns = ["Name", "Born", "Died", "Movement", "School", "Rank", "Tags", "Portrait", "Credit", "Article", "Colour", "Key", "Note"]

  it("converts rows to events through the map", () => {
    const { events } = normalizeTimelineProps({
      table: {
        columns,
        rows: [
          ["Leonardo", "1452-04-15", "1519-05-02", "High Renaissance", "Florence", 5, "painting, science , painting", "https://example.com/leo.jpg", "Uffizi", "https://en.wikipedia.org/wiki/Leonardo", "#aa3300", "leo", "Polymath"],
          ["Giotto", "c. 1267", 1337, "Proto-Renaissance", null, "2.6", "painting", "javascript:alert(1)", null, "ftp://example.com", "tomato", null, 42],
        ],
        map: {
          title: "Name", start: "Born", end: "Died", category: "Movement", group: "School", importance: "Rank",
          tags: "Tags", image: "Portrait", imageCredit: "Credit", link: "Article", color: "Colour", id: "Key",
          description: "Note",
        },
      },
    })
    expect(events).toEqual([
      {
        id: "leo",
        title: "Leonardo",
        description: "Polymath",
        start: { year: 1452, month: 4, day: 15, precision: "day" },
        end: { year: 1519, month: 5, day: 2, precision: "day" },
        importance: 5,
        category: "High Renaissance",
        group: "Florence",
        tags: ["painting", "science"],
        media: { url: "https://example.com/leo.jpg", credit: "Uffizi" },
        link: { url: "https://en.wikipedia.org/wiki/Leonardo" },
        style: { color: "#aa3300" },
      },
      {
        id: "row-1",
        title: "Giotto",
        description: "42",
        start: { year: 1267, precision: "year" },
        end: { year: 1337, precision: "year" },
        dateLabel: "c. 1267",
        importance: 3,
        category: "Proto-Renaissance",
        tags: ["painting"],
      },
    ])
  })

  it("drops rows without a title or a parseable start, and clamps importance", () => {
    const { events } = normalizeTimelineProps({
      table: {
        columns: ["t", "s", "i"],
        rows: [["", 1900, 3], [null, 1900, 3], ["No date", "sometime", 3], ["Too important", 1900, 99], ["Too humble", 1900, -4], ["Not a number", 1900, "high"], "not a row", ["Short row"]],
        map: { title: "t", start: "s", importance: "i" },
      },
    })
    expect(events.map(({ id, title, importance }) => [id, title, importance])).toEqual([
      ["row-3", "Too important", 5],
      ["row-4", "Too humble", 1],
      ["row-5", "Not a number", undefined],
    ])
  })

  it("gives nothing when the map names columns that do not exist", () => {
    const table = { columns: ["a"], rows: [["x"]], map: { title: "a", start: "missing" } }
    expect(normalizeTimelineProps({ table }).events).toEqual([])
    expect(normalizeTimelineProps({ table: { ...table, map: { start: "a" } } }).events).toEqual([])
  })

  it("keeps the table rows in bounds and ids unique", () => {
    const rows = Array.from({ length: 520 }, (_, index) => ["Same id", `${1000 + index}`, "dup"])
    const { events } = normalizeTimelineProps({ table: { columns: ["t", "s", "id"], rows, map: { title: "t", start: "s", id: "id" } } })
    expect(events).toHaveLength(500)
    expect(new Set(events.map((event) => event.id)).size).toBe(500)
    expect(events[1].id).toBe("dup-1")
  })
})


describe("parseTimelineDateCell", () => {
  const cases: Array<[unknown, unknown]> = [
    [1969, { date: { year: 1969, precision: "year" } }],
    [-500, { date: { year: -500, precision: "year" } }],
    [1969.7, { date: { year: 1969, precision: "year" } }],
    [-66_000_000, { date: { year: -66_000_000, precision: "million-years" } }],
    ["1969", { date: { year: 1969, precision: "year" } }],
    ["1969-07", { date: { year: 1969, month: 7, precision: "month" } }],
    ["1969-07-20", { date: { year: 1969, month: 7, day: 20, precision: "day" } }],
    ["1969/7/20", { date: { year: 1969, month: 7, day: 20, precision: "day" } }],
    ["1969-07-20T20:17:40Z", { date: { year: 1969, month: 7, day: 20, precision: "day" } }],
    [" -500 ", { date: { year: -500, precision: "year" } }],
    ["500 BCE", { date: { year: -500, precision: "year" } }],
    ["500 bc", { date: { year: -500, precision: "year" } }],
    ["13,800,000,000 BCE", { date: { year: -13_800_000_000, precision: "million-years" } }],
    ["AD 800", { date: { year: 800, precision: "year" } }],
    ["800 CE", { date: { year: 800, precision: "year" } }],
    ["66 million years ago", { date: { year: -66_000_000, precision: "million-years" } }],
    ["4.54 billion years ago", { date: { year: -4_540_000_000, precision: "million-years" } }],
    ["12 thousand years ago", { date: { year: -12_000, precision: "year" } }],
    ["c. 1500", { date: { year: 1500, precision: "year" }, label: "c. 1500" }],
    ["circa 1500", { date: { year: 1500, precision: "year" }, label: "circa 1500" }],
    ["ca. 300 BC", { date: { year: -300, precision: "year" }, label: "ca. 300 BC" }],
    ["c 1500-06", { date: { year: 1500, month: 6, precision: "month" }, label: "c 1500-06" }],
  ]
  it.each(cases)("parses %j", (cell, expected) => {
    expect(parseTimelineDateCell(cell)).toEqual(expected)
  })

  it.each([
    [""], ["   "], [null], [undefined], [NaN], [Infinity], ["July"], ["1969-13"], ["1969-02-32"],
    ["20 BCE BCE"], ["circa"], ["c. sometime"], [200_000], ["999999999999"], [true], [{ year: 1 }],
  ])("refuses %j", (cell) => {
    expect(parseTimelineDateCell(cell)).toBeNull()
  })
})


describe("text, URLs and dates", () => {
  it("reduces HTML to plain text, keeping paragraphs and decoding entities", () => {
    expect(toPlainText("<p>One &amp; two</p><p>Three<br>four&#33; &#x1F600;</p>")).toBe("One & two\nThree\nfour! 😀")
    expect(toPlainText('<img src=x onerror="alert(1)">Safe')).toBe("Safe")
    expect(toPlainText(undefined)).toBe("")
    expect(toPlainText(42)).toBe("")
  })

  it("allows only http(s) URLs", () => {
    expect(safeHttpUrl("https://example.com/a b.jpg")).toBe("https://example.com/a%20b.jpg")
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com/")
    for (const url of ["javascript:alert(1)", " JAVASCRIPT:alert(1)", "data:image/png;base64,AAAA", "blob:x", "//example.com", "ftp://x", "", 42]) {
      expect(safeHttpUrl(url)).toBeUndefined()
    }
    expect(safeHttpUrl(`https://example.com/${"a".repeat(2100)}`)).toBeUndefined()
  })

  it("formats dates at their precision, including deep time", () => {
    expect(formatTimelineDate({ year: 1969, month: 7, day: 20, precision: "day" })).toBe("20 Jul 1969")
    expect(formatTimelineDate({ year: 1969, month: 7, precision: "month" })).toBe("Jul 1969")
    expect(formatTimelineDate({ year: -500, precision: "year" })).toBe("500 BCE")
    expect(formatTimelineDate({ year: 1964, precision: "decade" })).toBe("1960s")
    expect(formatTimelineDate({ year: 1969, precision: "century" })).toBe("20th century")
    expect(formatTimelineDate({ year: 2000, precision: "century" })).toBe("20th century")
    expect(formatTimelineDate({ year: -450, precision: "century" })).toBe("5th century BCE")
    expect(formatTimelineDate({ year: 1066, precision: "millennium" })).toBe("2nd millennium")
    expect(formatTimelineDate({ year: -66_000_000, precision: "million-years" })).toBe("66 million years ago")
    expect(formatTimelineDate({ year: -13_800_000_000, precision: "million-years" })).toBe("13.8 billion years ago")
    expect(inferPrecision({ year: 5, day: 3 })).toBe("day")
  })

  it("labels an event with its dateLabel, or its date range", () => {
    const start = { year: 1961, precision: "year" as const }
    expect(formatEventDate({ start, end: { year: 1966, precision: "year" } })).toBe("1961 – 1966")
    expect(formatEventDate({ start, end: start })).toBe("1961")
    expect(formatEventDate({ start, dateLabel: "Early 60s" })).toBe("Early 60s")
  })
})
