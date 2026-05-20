import assert from "node:assert/strict";
import { goalCanvasDisplayLabel, preferShortCanvasLabel } from "./tree-canvas-label";

const isaTitle = "Have a £10,000 stocks and shares ISA by Dec 2026";

assert.ok(!preferShortCanvasLabel(isaTitle).endsWith("£10"));
assert.ok(preferShortCanvasLabel(isaTitle).includes("10"));
assert.ok(preferShortCanvasLabel(isaTitle).toLowerCase().includes("isa"));

assert.equal(
  preferShortCanvasLabel("Build £500k portfolio, tax wrappers, and pensions"),
  "£500k portfolio",
);

assert.equal(
  goalCanvasDisplayLabel(isaTitle, null, null).toLowerCase().includes("isa"),
  true,
);

console.log("tree-canvas-label.test.ts: ok");
