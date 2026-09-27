// @ts-nocheck
// dim0 entry point for the vendored Archify renderers (see README.md).
// Pure, browser-safe functions: typed diagram JSON in, SVG string out. Each
// renderer throws an Error (with a readable, newline-separated message) when the
// spec breaks one of Archify's layout/readability constraints.
export { renderArchitecture } from './renderers/architecture/render-architecture.mjs';
export { DEFAULT_GRID, gridLayout, resolveComponentPos } from './renderers/architecture/grid.mjs';
export { renderSequence } from './renderers/sequence/render-sequence.mjs';
export { compileWorkflow } from './renderers/workflow/workflow-compiler.mjs';
export { textUnits } from './renderers/shared/utils.mjs';
export { availableNodeTextWidth, minimumNodeTextWidth } from './renderers/shared/text-fit.mjs';
