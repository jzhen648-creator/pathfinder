export type FakeProviderFixtureId =
  | "fullReflect"
  | "panelsOnly"
  | "malformed"
  | "empty"
  | "rateLimit429"
  | "transient503";

class FakeProviderError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FakeProviderError";
    this.status = status;
  }
}

const DEFAULT_PANEL = {
  tone: "worth_a_look" as const,
  headline: "CeMAP qualification is active with a June deadline",
  body: "Unit 1 and Unit 2 remain on the path toward the qualification deadline.",
  suggestedMilestones: null,
  clarifiers: [
    {
      id: "ctx-1",
      prompt: "What stage are you at?",
      options: ["Planning", "In progress", "Not sure"],
    },
  ],
};

let overrideFixture: FakeProviderFixtureId | null = null;
let fixtureSequence: FakeProviderFixtureId[] = [];
let callCount = 0;

export function isFakeProviderEnabled(): boolean {
  return process.env.AI_FAKE_PROVIDER === "1";
}

export function setFakeProviderFixture(id: FakeProviderFixtureId | null): void {
  overrideFixture = id;
  fixtureSequence = [];
}

export function setFakeProviderFixtureSequence(ids: FakeProviderFixtureId[]): void {
  fixtureSequence = ids;
  overrideFixture = null;
}

export function resetFakeProviderState(): void {
  overrideFixture = null;
  fixtureSequence = [];
  callCount = 0;
}

export function getFakeProviderCallCount(): number {
  return callCount;
}

function inferFixtureFromPrompt(user: string): FakeProviderFixtureId {
  if (fixtureSequence.length > 0) {
    const index = Math.min(Math.max(callCount - 1, 0), fixtureSequence.length - 1);
    return fixtureSequence[index] ?? "fullReflect";
  }
  if (overrideFixture) return overrideFixture;
  if (user.includes('Return ONLY: { "pursuits"')) {
    return "panelsOnly";
  }
  return "fullReflect";
}

function pursuitPanelsFromUser(user: string): Record<string, typeof DEFAULT_PANEL> {
  const match = user.match(/<dirty_pursuits>\n(\[[\s\S]*?\])\n<\/dirty_pursuits>/);
  const pursuitIds: string[] = match ? (JSON.parse(match[1]) as string[]) : ["p-cemap"];
  return Object.fromEntries(
    pursuitIds.map((id) => [
      id,
      {
        ...DEFAULT_PANEL,
        headline: `Panel for ${id}`,
      },
    ]),
  );
}

function fixtureJson(id: FakeProviderFixtureId, user: string): string {
  switch (id) {
    case "fullReflect": {
      const pursuits = pursuitPanelsFromUser(user);
      return JSON.stringify({
        themes: {
          work: {
            tone: "encouraging",
            oneLiner: "Work pursuits are active",
            reflective: "Active pursuits with near-term deadlines.",
            contextual: "",
            combined: "",
          },
        },
        pursuits,
      });
    }
    case "panelsOnly": {
      const pursuits = pursuitPanelsFromUser(user);
      return JSON.stringify({ pursuits });
    }
    case "malformed":
      return "{ not valid json";
    case "empty":
      return "";
    default: {
      const pursuits = pursuitPanelsFromUser(user);
      return JSON.stringify({
        themes: {},
        pursuits,
      });
    }
  }
}

/** Deterministic AI responses for tests — no network when AI_FAKE_PROVIDER=1. */
export async function resolveFakeJsonCompletion(input: {
  user: string;
}): Promise<string> {
  callCount += 1;
  const fixture = inferFixtureFromPrompt(input.user);

  if (fixture === "rateLimit429") {
    throw new FakeProviderError("Gemini quota or rate limit was exceeded. Try again later.", 429);
  }
  if (fixture === "transient503") {
    throw new FakeProviderError("Gemini is temporarily unavailable. Try again later.", 503);
  }

  return fixtureJson(fixture, input.user);
}

export function panelsOnlyFixtureJson(pursuitIds: string[]): string {
  const pursuits = Object.fromEntries(
    pursuitIds.map((id) => [
      id,
      {
        ...DEFAULT_PANEL,
        headline: `Panel for ${id}`,
      },
    ]),
  );
  return JSON.stringify({ pursuits });
}
