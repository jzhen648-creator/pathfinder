import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  list: vi.fn(),
  stage: vi.fn(),
}));

vi.mock("@/lib/almanac/auth", () => ({
  requireAlmanacDogfoodUser: (...args: unknown[]) => mocks.requireUser(...args),
}));
vi.mock("@/lib/almanac/suggestion-service", () => ({
  listAlmanacSuggestions: (...args: unknown[]) => mocks.list(...args),
  stageAlmanacSuggestions: (...args: unknown[]) => mocks.stage(...args),
}));

const body = {
  idempotencyKey: "persistent-source-001",
  rawPacket: "ALMANAC/1\nscope: chat\nStudio | NEXT | Book a session.",
};

function request(method: "GET" | "POST", capable = true, requestBody: unknown = body) {
  return new Request("http://localhost/api/almanac/suggestions", {
    method,
    ...(capable ? { headers: { "X-Almanac-Capabilities": "persistent-suggestions-v1" } } : {}),
    ...(method === "POST" ? { body: JSON.stringify(requestBody) } : {}),
  });
}

describe("/api/almanac/suggestions", () => {
  beforeEach(() => {
    vi.stubEnv("ALMANAC_PERSISTED_DOGFOOD_ENABLED", "1");
    mocks.requireUser.mockResolvedValue({ ok: true, userId: "owner-a" });
    mocks.list.mockResolvedValue({ suggestions: [] });
    mocks.stage.mockResolvedValue({
      disposition: "created",
      importId: "import-a",
      suggestions: [],
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("requires authentication before reading owner data", async () => {
    mocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const { GET } = await import("./route");
    expect((await GET(request("GET"))).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("requires an explicitly capable client", async () => {
    const { GET, POST } = await import("./route");
    expect((await GET(request("GET", false))).status).toBe(409);
    expect((await POST(request("POST", false))).status).toBe(409);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.stage).not.toHaveBeenCalled();
  });

  it("takes ownership only from the authenticated session", async () => {
    const { GET, POST } = await import("./route");
    expect((await GET(request("GET"))).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("owner-a");
    expect((await POST(request("POST"))).status).toBe(201);
    expect(mocks.stage).toHaveBeenCalledWith("owner-a", body);
    expect((await POST(request("POST", true, { ...body, userId: "owner-b" }))).status).toBe(400);
  });

  it("returns the stored result on an exact staging retry", async () => {
    mocks.stage.mockResolvedValue({
      disposition: "idempotent_retry",
      importId: "import-a",
      suggestions: [],
    });
    const { POST } = await import("./route");
    expect((await POST(request("POST"))).status).toBe(200);
  });
});
