import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getFakeProviderCallCount,
  isFakeProviderEnabled,
  resetFakeProviderState,
  setFakeProviderFixture,
} from "@/lib/ai/__fixtures__/fake-provider";
import { generateJsonCompletion } from "@/lib/ai-client";

describe("AI_FAKE_PROVIDER seam", () => {
  const originalEnv = process.env.AI_FAKE_PROVIDER;

  beforeEach(() => {
    process.env.AI_FAKE_PROVIDER = "1";
    resetFakeProviderState();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AI_FAKE_PROVIDER;
    } else {
      process.env.AI_FAKE_PROVIDER = originalEnv;
    }
    resetFakeProviderState();
    vi.restoreAllMocks();
  });

  it("is enabled when AI_FAKE_PROVIDER=1", () => {
    expect(isFakeProviderEnabled()).toBe(true);
  });

  it("returns deterministic JSON without calling OpenAI", async () => {
    const json = await generateJsonCompletion({
      system: "test",
      user: '<dirty_pursuits>\n["p-cemap"]\n</dirty_pursuits>\nReturn ONLY: { "reading": "", "pursuits": { ... } }',
    });

    expect(JSON.parse(json).reading).toBe("");
    expect(JSON.parse(json).pursuits["p-cemap"]).toBeDefined();
    expect(getFakeProviderCallCount()).toBe(1);
  });

  it("throws 429 when fixture is rateLimit429", async () => {
    setFakeProviderFixture("rateLimit429");

    await expect(
      generateJsonCompletion({ system: "test", user: "any" }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("returns malformed JSON when fixture is malformed", async () => {
    setFakeProviderFixture("malformed");

    const json = await generateJsonCompletion({ system: "test", user: "any" });
    expect(json).toContain("not valid json");
  });
});
