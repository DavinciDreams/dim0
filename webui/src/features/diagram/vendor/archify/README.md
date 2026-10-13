# Vendored Archify renderers

- Upstream: https://github.com/tt-a1i/archify (MIT — see `LICENSE`, both copyright lines kept)
- Pinned commit: `9e35d2b0b39b155553ba9fcfe0b4f2a5198dd993`
- Consumer: `webui/src/features/diagram/` (the `diagram` note type). Loaded lazily — never
  import this directory from eagerly-loaded board code; go through `features/diagram/load.ts`.

Archify turns a typed JSON IR (`schema_version`, `diagram_type`, `meta`, body) into an SVG
string styled by CSS classes. dim0 vendors only the three renderers it exposes, converted to
pure browser-safe functions.

## What was vendored (paths relative to upstream `archify/renderers/`)

| File | Status |
| --- | --- |
| `architecture/grid.mjs` | verbatim |
| `architecture/render-architecture.mjs` | wrapped — see below |
| `sequence/render-sequence.mjs` | wrapped — see below |
| `workflow/workflow-compiler.mjs` | verbatim (`compileWorkflow` is already pure) |
| `workflow/workflow-migration-geometry.mjs` | verbatim |
| `shared/geometry.mjs` | one line: dropped the `process.env.ARCHIFY_QUALITY_PROFILE` fallback |
| `shared/utils.mjs`, `i18n.mjs`, `text-fit.mjs`, `legend.mjs`, `layout-report.mjs`, `desktop-readability.mjs` | verbatim |
| `shared/diagnostics.mjs` | trimmed: no `node:fs`/`node:path`, no env switch, no stderr crash boundary |
| `shared/cli.mjs` | **replaced**: keeps only the pure SVG-attribute helpers (no fs, no template, no env) |
| `shared/brand-marks.mjs` | **replaced by a no-op stub** (see below) |
| `shared/validator.mjs` | **replaced by a no-op stub** (see below) |

"Verbatim" files only gained a leading `// @ts-nocheck`. `index.mjs` / `index.d.mts` are
dim0-authored (entry point + hand-written types).

### Wrapped renderers

Upstream `render-architecture.mjs` / `render-sequence.mjs` are CLI scripts (top-level `await`,
`process.argv`, `process.exit`, write an HTML file). The node imports, the CLI head
(`loadDiagramWithBrandMarks`) and the tail (`writeDiagram` / `--layout-json`) were removed and
the module body was wrapped, unindented, in `export function renderArchitecture(arch)` /
`export function renderSequence(sequence)` returning `renderSvg()`. Every line in between is
upstream, so a re-sync is: copy the new file, re-apply the same head/tail edit.

## What was left out, and why

- **Brand marks** (`shared/brand-marks.mjs`, `generated-brand-marks.mjs`, `brand-marks/`):
  network fetches via `node:crypto/dns/http/https/net`, and part of the mark catalog is
  CC-BY-NC-SA (not MIT-compatible for us). The stub renders every node as brand-less.
- **ajv validators** (`generated-validators.mjs`, ~432 KB): dim0 validates with zod in
  `features/diagram/schema.ts` before calling a renderer.
- **Dataflow and lifecycle renderers**, the HTML viewer template (`assets/template.html`,
  ~775 KB incl. fonts), repository evidence, output-path and engineering-profile checks: not
  needed for inline SVG on a board. The SVG CSS classes from the template were ported to
  `features/diagram/diagram.css` against dim0 theme tokens.
- `render-workflow.mjs` (CLI wrapper around `compileWorkflow`).

## Re-syncing

1. `git clone https://github.com/tt-a1i/archify` and check out the new commit.
2. Copy the "verbatim" files over, re-add `// @ts-nocheck`.
3. Re-apply the head/tail wrap to the two CLI renderers and the one-line `geometry.mjs` edit.
4. Diff upstream `shared/cli.mjs` / `diagnostics.mjs` for changes to the kept helpers.
5. Update the pinned commit above and run `features/diagram/*.test.ts`.
