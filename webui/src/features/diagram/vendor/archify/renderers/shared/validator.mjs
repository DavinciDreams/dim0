// @ts-nocheck
// dim0 browser shim — replaces upstream shared/validator.mjs.
//
// Upstream validates against ~430 KB of ajv-generated validators. dim0 validates
// every spec with zod (features/diagram/schema.ts) BEFORE it reaches a renderer,
// so the renderer-internal schema pass is a no-op here.

export function validateSchema() {}
