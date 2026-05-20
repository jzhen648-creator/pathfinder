import assert from "node:assert/strict";
import {
  extractNumericTargets,
  labelPreservesNumericSalience,
  labelPreservesSalience,
} from "./canvas-label-salience";

const youtube5k =
  "Reach 5,000 subscribers on YouTube by the end of 2026";
const youtube10k =
  "Reach 10,000 subscribers on YouTube by the end of 2027";

const targets5k = extractNumericTargets(youtube5k);
assert.equal(targets5k.length, 1);
assert.equal(targets5k[0]?.value, 5000);
assert.ok(targets5k[0]?.hints.includes("subscribers"));

assert.equal(labelPreservesNumericSalience("Reach 5k YouTube subs", youtube5k), true);
assert.equal(labelPreservesNumericSalience("Reach 5", youtube5k), false);
assert.equal(labelPreservesSalience("Reach 5", youtube5k), false);
assert.equal(labelPreservesNumericSalience("Reach 10k YouTube subs", youtube10k), true);

// Currency + amounts — deadline years must not be treated as magnitudes
const isaTitle = "Have a £10,000 stocks and shares ISA by Dec 2026";
assert.deepEqual(
  extractNumericTargets(isaTitle).map((t) => t.value),
  [10000],
);
assert.equal(labelPreservesNumericSalience("£10k stocks and shares ISA", isaTitle), true);
assert.equal(labelPreservesSalience("£10k ISA", isaTitle), true);
assert.equal(labelPreservesSalience("£10k stocks and shares ISA", isaTitle), true);

assert.equal(
  labelPreservesSalience("£500k portfolio", "Build £500k investment portfolio by year 10"),
  true,
);
assert.equal(labelPreservesSalience("Grow ISA to £1M", "Grow ISA to £1,000,000 by 2030"), true);
assert.equal(labelPreservesSalience("£500k ISA", "Build £500k ISA"), true);
assert.equal(labelPreservesSalience("£50k mortgage advisor role", "Secure role at £50k base"), true);

// Euro / dollar amounts
assert.equal(labelPreservesNumericSalience("€50k house deposit", "Save €50,000 for house deposit"), true);
assert.equal(labelPreservesNumericSalience("$100k salary target", "Earn $100,000 salary"), true);

console.log("canvas-label-salience.test.ts: ok");
