import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireApiSessionUserId: vi.fn(),
  updateAtlasChapterPresentation: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => mocks.requireApiSessionUserId(...args),
}));
vi.mock("@/lib/atlas/load-atlas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atlas/load-atlas")>();
  return {
    ...actual,
    updateAtlasChapterPresentation: (...args: unknown[]) =>
      mocks.updateAtlasChapterPresentation(...args),
  };
});

const context = { params: Promise.resolve({ goalId: "goal-1" }) };

async function patch(body: unknown, rawBody?: string) {
  const { PATCH } = await import("./route");
  return PATCH(
    new Request("http://localhost/api/atlas/chapters/goal-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: rawBody ?? JSON.stringify(body),
    }),
    context,
  );
}

describe("PATCH /api/atlas/chapters/[goalId]", () => {
  beforeEach(() => {
    mocks.requireApiSessionUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    mocks.updateAtlasChapterPresentation.mockResolvedValue({ chapters: [] });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("requires authentication before parsing or updating", async () => {
    mocks.requireApiSessionUserId.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const response = await patch({ shown: false });
    expect(response.status).toBe(401);
    expect(mocks.updateAtlasChapterPresentation).not.toHaveBeenCalled();
  });

  it("updates only projection presentation state", async () => {
    const response = await patch({ shown: false, focused: true });
    expect(response.status).toBe(200);
    expect(mocks.updateAtlasChapterPresentation).toHaveBeenCalledWith(
      "user-1",
      "goal-1",
      { shown: false, focused: true },
    );
  });

  it.each([{}, { shown: "yes" }, { status: "ACTIVE" }])(
    "rejects an invalid patch",
    async (body) => {
      const response = await patch(body);
      expect(response.status).toBe(400);
      expect(mocks.updateAtlasChapterPresentation).not.toHaveBeenCalled();
    },
  );

  it("returns 400 for malformed JSON", async () => {
    expect((await patch(undefined, "{")).status).toBe(400);
  });
});
