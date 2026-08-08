import { describe, expect, it } from "vitest";
import { assertImportGraphOwnership, ImportOwnershipError } from "./ownership";

describe("import graph ownership", () => {
  it("accepts an entirely user-owned graph", () => {
    expect(() =>
      assertImportGraphOwnership("user-1", [
        { entity: "source", id: "source-1", userId: "user-1" },
        { entity: "chapter", id: "goal-1", userId: "user-1" },
      ]),
    ).not.toThrow();
  });

  it("fails closed when any target belongs to another user", () => {
    expect(() =>
      assertImportGraphOwnership("user-1", [
        { entity: "source", id: "source-1", userId: "user-1" },
        { entity: "chapter", id: "goal-2", userId: "user-2" },
      ]),
    ).toThrow(ImportOwnershipError);
  });
});

