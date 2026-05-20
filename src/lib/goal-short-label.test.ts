import assert from "node:assert/strict";
import { generateGoalShortLabel } from "./goal-short-label";

const cases: Array<[string, string]> = [
  ["Reach 5,000 subscribers on YouTube by the end of 2026", "5k subscribers YouTube"],
  ["Have a £10,000 stocks and shares ISA by Dec 2026", "£10k stocks shares ISA"],
  ["Build £500k portfolio, tax wrappers, and pensions", "£500k portfolio tax wrappers pensions"],
  ["Build shared ownership flat with Dad before London move", "Shared ownership flat Dad London"],
  ["Grow ISA to £1,000,000 by 2030", "ISA £1M"],
  ["Run sub-3:30 marathon in 2027", "Sub-3:30 marathon 2027"],
  ["Complete CEMAP Module 1 by March 2026", "CEMAP Module 1 March 2026"],
];

for (const [title, expected] of cases) {
  const actual = generateGoalShortLabel(title);
  assert.equal(actual, expected);
  assert.ok((actual ?? "").split(/\s+/).length <= 6, `${actual} should be at most 6 words`);
}

console.log("goal-short-label.test.ts: ok");
