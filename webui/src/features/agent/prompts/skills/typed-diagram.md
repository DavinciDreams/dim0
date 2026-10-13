You are authoring a **typed diagram note**: `write_note(note_type="diagram", content=<JSON spec>)`. The board renders the spec as a clean, color-coded SVG (architecture, sequence, or workflow). Use it for system architecture, request/message sequences, and multi-actor processes. For simple idea maps, taxonomies and small flowcharts, keep using linked notes (`learn_generate_diagram`) instead.

`content` is ONE JSON object (no prose, no code fences). It is validated before it is saved; if it is rejected, the error names the exact field — fix that and retry once.

## Shared rules

- `diagram_type`: `"architecture"` | `"sequence"` | `"workflow"`. `meta.title` is required; `meta.subtitle` optional.
- ids: start with a letter, then letters / digits / `_` / `-` (e.g. `api`, `auth-db`). Every `from` / `to` / `wraps` / `lane` must reference an existing id.
- Every box has a `type` that sets its color: `frontend` | `backend` | `database` | `cloud` | `security` | `messagebus` | `external`.
- Labels are short nouns (≤ 3 words). Put detail in `sublabel` (≤ 4 words), never in the label.
- Arrow `variant`: `default` | `emphasis` (main path) | `security` | `dashed` (async / optional). Sequence messages also allow `return`.
- Do NOT write coordinates (`pos`, `size`, `y`, `viewBox`) — layout is automatic. Keep diagrams to ≤ 12 boxes; split bigger systems into two diagrams.

## architecture — components, connections, optional boundaries

Components are laid out automatically from the connections (left → right). Optionally group components with `boundaries` (`kind`: `region` | `security-group`). Only if the user needs a specific arrangement, give every component a grid cell `row` / `col` (0-based) instead.

```json
{
  "diagram_type": "architecture",
  "meta": { "title": "Web App" },
  "components": [
    { "id": "web", "type": "frontend", "label": "Web Client", "sublabel": "React SPA" },
    { "id": "api", "type": "backend", "label": "API", "sublabel": "FastAPI" },
    { "id": "db", "type": "database", "label": "Postgres" },
    { "id": "queue", "type": "messagebus", "label": "Job Queue" }
  ],
  "boundaries": [{ "kind": "region", "label": "Cloud VPC", "wraps": ["api", "db", "queue"] }],
  "connections": [
    { "from": "web", "to": "api", "label": "HTTPS", "variant": "emphasis" },
    { "from": "api", "to": "db", "label": "SQL" },
    { "from": "api", "to": "queue", "label": "enqueue", "variant": "dashed" }
  ]
}
```

## sequence — participants and time-ordered messages

2–8 `participants` become columns in array order. `messages` are drawn top to bottom in array order. Give messages an `id` when you want to reference them: an `activation` bar (`participant`, `from` / `to` = message ids) or a `segment` band (`label`, `from` / `to` = message ids).

```json
{
  "diagram_type": "sequence",
  "meta": { "title": "Login" },
  "participants": [
    { "id": "user", "type": "external", "label": "User" },
    { "id": "app", "type": "frontend", "label": "App" },
    { "id": "auth", "type": "security", "label": "Auth" }
  ],
  "messages": [
    { "id": "submit", "from": "user", "to": "app", "label": "submit form" },
    { "id": "verify", "from": "app", "to": "auth", "label": "verify", "variant": "security" },
    { "id": "token", "from": "auth", "to": "app", "label": "JWT", "variant": "return" },
    { "from": "app", "to": "user", "label": "signed in", "variant": "return" }
  ],
  "activations": [{ "participant": "auth", "from": "verify", "to": "token" }]
}
```

## workflow — swimlanes × columns

`lanes` are horizontal rows (the actors / systems). Each node sits in one `lane` at a `col` from 0 to 5 (left → right = time; at most 6 columns). Put a node one column right of the node it follows; nodes in the same lane must use different columns. Edges connect node ids; `role` may be `main` | `branch` | `async` | `return` | `error`.

```json
{
  "diagram_type": "workflow",
  "meta": { "title": "Order Fulfilment" },
  "lanes": [
    { "id": "shop", "label": "Storefront" },
    { "id": "ops", "label": "Operations" }
  ],
  "nodes": [
    { "id": "order", "lane": "shop", "col": 0, "type": "frontend", "label": "Place Order" },
    { "id": "pay", "lane": "shop", "col": 1, "type": "security", "label": "Payment" },
    { "id": "pick", "lane": "ops", "col": 2, "type": "backend", "label": "Pick & Pack" },
    { "id": "ship", "lane": "ops", "col": 3, "type": "cloud", "label": "Ship" }
  ],
  "edges": [
    { "from": "order", "to": "pay" },
    { "from": "pay", "to": "pick", "label": "paid" },
    { "from": "pick", "to": "ship" }
  ]
}
```

## Before you submit

1. The right type: static structure → architecture; who-calls-whom over time → sequence; steps owned by different actors → workflow.
2. Every id referenced exists; labels are short; no coordinates.
3. Give the note a short `label` (the diagram's title). One diagram note per request unless the user asked for more.
