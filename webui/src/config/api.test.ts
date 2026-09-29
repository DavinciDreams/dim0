import { describe, expect, it } from "vitest"
import { resolveApiUrl, resolveApiWebSocketUrl } from "./api"


describe("API URL resolution", () => {
  it("preserves a shared-domain path prefix for HTTP requests", () => {
    expect(resolveApiUrl("/users/me", "https://example.com/api").toString()).toBe(
      "https://example.com/api/users/me",
    )
  })

  it("does not invent a prefix for a root backend URL", () => {
    expect(resolveApiUrl("/users/me", "https://api.example.com").toString()).toBe(
      "https://api.example.com/users/me",
    )
  })

  it("preserves the prefix and query string for secure WebSockets", () => {
    expect(
      resolveApiWebSocketUrl(
        "/boards/board-1/collab?ticket=abc",
        "https://example.com/api",
      ),
    ).toBe("wss://example.com/api/boards/board-1/collab?ticket=abc")
  })

  it("uses ws for an http backend", () => {
    expect(resolveApiWebSocketUrl("/collab", "http://localhost:8888")).toBe(
      "ws://localhost:8888/collab",
    )
  })
})
