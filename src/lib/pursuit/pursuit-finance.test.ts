import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPrimaryGbpAmount,
  financeAmountUnitFromText,
  syncFinanceMetricsFromProse,
} from "./pursuit-finance";

test("extractPrimaryGbpAmount parses common rental phrasing", () => {
  assert.equal(extractPrimaryGbpAmount("£1,650 in rental income"), 1650);
  assert.equal(extractPrimaryGbpAmount("getting about 1650 per month"), 1650);
});

test("financeAmountUnitFromText detects cadence", () => {
  assert.equal(financeAmountUnitFromText("£20k per year"), "GBP/year");
  assert.equal(financeAmountUnitFromText("£1,650/month"), "GBP/month");
});

test("syncFinanceMetricsFromProse returns structured metrics", () => {
  assert.deepEqual(syncFinanceMetricsFromProse("Monthly rent is £1,650 from the flat."), {
    currentAmount: 1650,
    unit: "GBP/month",
  });
});
