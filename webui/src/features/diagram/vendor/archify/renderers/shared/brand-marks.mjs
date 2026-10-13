// @ts-nocheck
// dim0 browser shim — replaces upstream shared/brand-marks.mjs.
//
// Upstream fetches/verifies brand logos over the network (node:crypto/dns/http/
// https/net) and bundles a generated mark catalog, part of which is licensed
// CC-BY-NC-SA. dim0 drops brand marks entirely: every node renders as if it had
// no `brand`, so these keep the upstream call signatures but never draw a mark.

export function brandMetadataFor() {
  return {};
}

export function brandLabelFitWidth(node, width) {
  return width;
}

export function brandTopRailProblem() {
  return null;
}

export function renderBrandMark() {
  return '';
}
