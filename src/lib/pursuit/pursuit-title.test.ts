import assert from "node:assert/strict";
import test from "node:test";
import {
  generalizePursuitTitle,
  preferExistingMapTitle,
  titleLooksOverSpecific,
} from "./pursuit-title";

test("titleLooksOverSpecific flags amounts in titles", () => {
  assert.equal(titleLooksOverSpecific("Rental income"), false);
  assert.equal(titleLooksOverSpecific("£1,650 in rental income"), true);
});

test("generalizePursuitTitle strips leading amounts", () => {
  assert.equal(generalizePursuitTitle("£1,650 in rental income"), "Rental income");
});

test("preferExistingMapTitle keeps stable label over amount-heavy proposal", () => {
  assert.equal(
    preferExistingMapTitle("Rental income", "£1,650 in rental income"),
    true,
  );
});
