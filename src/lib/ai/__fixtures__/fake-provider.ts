export type FakeProviderFixtureId =
  | "fullReflect"
  | "panelsOnly"
  | "importCandidates"
  | "importNoDurableValue"
  | "importLifeSnapshot"
  | "importRawConversation"
  | "importCustomSummary"
  | "importIdeaExploration"
  | "importIdeaRejection"
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

export const LIFE_IMPORT_FIXTURE_TEXTS = {
  snapshot: [
    "Alex intends to return to Manchester on 16 August 2026; older plans said September or October.",
    "Alex is British-Singaporean and has lived in three countries.",
    "Alex completed a mortgage-advice qualification on 15 April 2026.",
    "Alex's brother is an engineering apprentice.",
    "Alex might buy a home with his brother, who could contribute about £800 monthly if they buy together.",
    "The assistant's view was that buying an electric van before testing customer demand would be premature.",
  ].join("\n"),
  rawConversation: [
    "User: I am returning to Manchester on 16 August 2026; my flight is booked.",
    "User: My partner and I want to settle in Manchester eventually.",
    "User: I am not sure whether our legal marriage status is fully documented.",
    "User: My investment account currently holds about £12,000.",
    "Assistant: You should leave your job immediately and start a company.",
  ].join("\n"),
  customSummary: [
    "Manchester return remains planned for 16 August 2026.",
    "Alex's mortgage-advice qualification was completed in April 2026.",
    "A newer note says the return may instead be 30 August 2026.",
    "The exact legal marriage status remains unresolved.",
  ].join("\n"),
  ideaExploration:
    "Maybe I could buy an EV9 and run private tours for Chinese visitors. I am only exploring this; I have not decided to do it.",
  ideaRejection:
    "On 2 August 2026, I decided not to pursue the EV9 private-tour business.",
} as const;

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
  if (user.includes("<import_segment>")) {
    return "importCandidates";
  }
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

function importSegmentFromUser(user: string): { position: number; text: string } {
  const match = user.match(/<import_segment>\n(\{[\s\S]*?\})\n<\/import_segment>/);
  const segment = match
    ? (JSON.parse(match[1]) as { position?: number; text?: string })
    : { position: 0, text: "Source segment" };
  return {
    position: segment.position ?? 0,
    text: segment.text ?? "Source segment",
  };
}

function importObservationsFromUser(
  user: string,
): Array<{ id: string; kind: string; canonicalText: string }> {
  const match = user.match(/<existing_life_model>\n(\{[\s\S]*?\})\n<\/existing_life_model>/);
  if (!match) return [];
  const parsed = JSON.parse(match[1]) as {
    observations?: Array<{ id?: string; kind?: string; canonicalText?: string }>;
  };
  return (parsed.observations ?? []).flatMap((observation) =>
    observation.id && observation.kind && observation.canonicalText
      ? [
          {
            id: observation.id,
            kind: observation.kind,
            canonicalText: observation.canonicalText,
          },
        ]
      : [],
  );
}

function exactEvidence(segmentText: string, quote: string) {
  const startOffset = segmentText.indexOf(quote);
  if (startOffset < 0) throw new Error("Fake import fixture quote is missing from its source.");
  return [
    {
      startOffset,
      endOffset: startOffset + quote.length,
      quote,
      role: "supports",
      supportType: "explicit",
    },
  ];
}

function fixtureJson(id: FakeProviderFixtureId, user: string): string {
  switch (id) {
    case "importCandidates": {
      const segment = importSegmentFromUser(user);
      const position = segment.position;
      const quote = segment.text.slice(0, Math.min(segment.text.length, 240));
      return JSON.stringify({
        candidates: [
          {
            id: `candidate-${position}`,
            classification: "new",
            canonicalKey: `segment-${position}`,
            proposedText: `Durable observation from segment ${position}`,
            informationType: "fact",
            subjectType: "user",
            subjectLabel: null,
            memoryDestination: "background",
            backgroundCategory: "other",
            temporal: {
              state: "unknown",
              precision: "unknown",
              effectiveFrom: null,
              effectiveTo: null,
            },
            evidence: [
              {
                startOffset: 0,
                endOffset: quote.length,
                quote,
                role: "supports",
                supportType: "explicit",
              },
            ],
            confidence: 0.86,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "Deterministic import-processing fixture.",
          },
        ],
      });
    }
    case "importNoDurableValue": {
      const segment = importSegmentFromUser(user);
      const quote = segment.text.slice(0, Math.min(segment.text.length, 240));
      return JSON.stringify({
        candidates: [
          {
            id: "no-durable-value",
            classification: "no_durable_value",
            canonicalKey: null,
            proposedText: "No durable user-owned meaning in this segment.",
            informationType: "context",
            subjectType: "unknown",
            subjectLabel: null,
            memoryDestination: "source_only",
            backgroundCategory: null,
            temporal: {
              state: "unknown",
              precision: "unknown",
              effectiveFrom: null,
              effectiveTo: null,
            },
            evidence: [
              {
                startOffset: 0,
                endOffset: quote.length,
                quote,
                role: "supports",
                supportType: "explicit",
              },
            ],
            confidence: 0.9,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "Conversational or quoted material only.",
          },
        ],
      });
    }
    case "importLifeSnapshot": {
      const { text } = importSegmentFromUser(user);
      const returnQuote = "Alex intends to return to Manchester on 16 August 2026; older plans said September or October.";
      const identityQuote = "Alex is British-Singaporean and has lived in three countries.";
      const qualificationQuote = "Alex completed a mortgage-advice qualification on 15 April 2026.";
      const brotherQuote = "Alex's brother is an engineering apprentice.";
      const housingQuote = "Alex might buy a home with his brother, who could contribute about £800 monthly if they buy together.";
      const adviceQuote = "The assistant's view was that buying an electric van before testing customer demand would be premature.";
      return JSON.stringify({
        candidates: [
          {
            id: "return-date-update",
            classification: "new_chapter",
            canonicalKey: "relocation:manchester:return-date",
            proposedText: "Alex plans to return to Manchester on 16 August 2026.",
            chapterTitle: "Return to Manchester",
            primaryThemeId: "people",
            informationType: "commitment",
            subjectType: "user",
            subjectLabel: null,
            memoryDestination: "chapter",
            backgroundCategory: null,
            temporal: { state: "planned", precision: "exact", effectiveFrom: "2026-08-16", effectiveTo: null },
            evidence: exactEvidence(text, returnQuote),
            confidence: 0.96,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "The latest date explicitly replaces older estimates.",
          },
          {
            id: "identity-background",
            classification: "new",
            canonicalKey: "identity:british-singaporean",
            proposedText: "British-Singaporean, with experience living in three countries.",
            informationType: "fact",
            subjectType: "user",
            subjectLabel: null,
            memoryDestination: "background",
            backgroundCategory: "identity",
            temporal: { state: "unknown", precision: "unknown", effectiveFrom: null, effectiveTo: null },
            evidence: exactEvidence(text, identityQuote),
            confidence: 0.94,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "Durable identity context with no stated effective date.",
          },
          {
            id: "qualification-event",
            classification: "new",
            canonicalKey: "qualification:mortgage-advice:completed",
            proposedText: "Completed a mortgage-advice qualification on 15 April 2026.",
            informationType: "event",
            subjectType: "user",
            subjectLabel: null,
            memoryDestination: "background",
            backgroundCategory: "work_qualifications",
            temporal: { state: "past", precision: "exact", effectiveFrom: "2026-04-15", effectiveTo: null },
            evidence: exactEvidence(text, qualificationQuote),
            confidence: 0.98,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "A dated completed qualification is durable career context.",
          },
          {
            id: "brother-background",
            classification: "new",
            canonicalKey: "person:brother:occupation",
            proposedText: "Alex's brother is an engineering apprentice.",
            informationType: "fact",
            subjectType: "other_person",
            subjectLabel: "Alex's brother",
            memoryDestination: "background",
            backgroundCategory: "people",
            temporal: { state: "unknown", precision: "unknown", effectiveFrom: null, effectiveTo: null },
            evidence: exactEvidence(text, brotherQuote),
            confidence: 0.9,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "Useful relationship context, explicitly owned by another person.",
          },
          {
            id: "housing-possibility",
            classification: "new",
            canonicalKey: "housing:buy-with-brother",
            proposedText: "Alex may buy a home with his brother, with a possible £800 monthly contribution.",
            informationType: "possibility",
            subjectType: "shared",
            subjectLabel: "Alex and his brother",
            memoryDestination: "possibility",
            backgroundCategory: null,
            temporal: { state: "possible", precision: "unknown", effectiveFrom: null, effectiveTo: null },
            evidence: exactEvidence(text, housingQuote),
            confidence: 0.88,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "Conditional language must not become a commitment or dependable income.",
          },
          {
            id: "assistant-advice",
            classification: "no_durable_value",
            canonicalKey: null,
            proposedText: "An assistant advised testing demand before buying a vehicle.",
            informationType: "advice",
            subjectType: "unknown",
            subjectLabel: null,
            memoryDestination: "source_only",
            backgroundCategory: null,
            temporal: { state: "unknown", precision: "unknown", effectiveFrom: null, effectiveTo: null },
            evidence: exactEvidence(text, adviceQuote),
            confidence: 0.99,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "Assistant advice is not a user fact or commitment.",
          },
        ],
      });
    }
    case "importRawConversation": {
      const { text } = importSegmentFromUser(user);
      const returnQuote = "User: I am returning to Manchester on 16 August 2026; my flight is booked.";
      const settleQuote = "User: My partner and I want to settle in Manchester eventually.";
      const marriageQuote = "User: I am not sure whether our legal marriage status is fully documented.";
      const investmentQuote = "User: My investment account currently holds about £12,000.";
      const adviceQuote = "Assistant: You should leave your job immediately and start a company.";
      return JSON.stringify({
        candidates: [
          {
            id: "return-date-raw",
            classification: "new_chapter",
            canonicalKey: "relocation:manchester:return-date",
            proposedText: "Alex plans to return to Manchester on 16 August 2026.",
            chapterTitle: "Return to Manchester",
            primaryThemeId: "people",
            informationType: "commitment",
            subjectType: "user",
            subjectLabel: null,
            memoryDestination: "chapter",
            backgroundCategory: null,
            temporal: { state: "planned", precision: "exact", effectiveFrom: "2026-08-16", effectiveTo: null },
            evidence: exactEvidence(text, returnQuote),
            confidence: 0.98,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "The user states a booked relocation date.",
          },
          {
            id: "shared-settlement-aspiration",
            classification: "new_chapter",
            canonicalKey: "relationship:settle-in-manchester",
            proposedText: "Alex and his partner want to settle in Manchester eventually.",
            chapterTitle: "Settle in Manchester",
            primaryThemeId: "people",
            informationType: "aspiration",
            subjectType: "shared",
            subjectLabel: "Alex and his partner",
            memoryDestination: "chapter",
            backgroundCategory: null,
            temporal: { state: "planned", precision: "unknown", effectiveFrom: null, effectiveTo: null },
            evidence: exactEvidence(text, settleQuote),
            confidence: 0.9,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "A shared aspiration, not a dated commitment.",
          },
          {
            id: "marriage-status-unresolved",
            classification: "new",
            canonicalKey: "relationship:legal-marriage-status",
            proposedText: "The exact legal marriage status remains unresolved.",
            informationType: "open_question",
            subjectType: "shared",
            subjectLabel: "Alex and his partner",
            memoryDestination: "background",
            backgroundCategory: "people",
            temporal: { state: "unresolved", precision: "unknown", effectiveFrom: null, effectiveTo: null },
            evidence: exactEvidence(text, marriageQuote),
            confidence: 0.93,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "The user explicitly says the legal status is uncertain.",
          },
          {
            id: "investment-balance",
            classification: "new",
            canonicalKey: "finance:investment-account:balance",
            proposedText: "The investment account currently holds approximately £12,000.",
            informationType: "fact",
            subjectType: "user",
            subjectLabel: null,
            memoryDestination: "background",
            backgroundCategory: "assets_finances",
            temporal: { state: "current", precision: "approximate", effectiveFrom: null, effectiveTo: null },
            evidence: exactEvidence(text, investmentQuote),
            confidence: 0.95,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "A current approximate amount whose observation time comes from the source receipt.",
          },
          {
            id: "assistant-career-advice",
            classification: "no_durable_value",
            canonicalKey: null,
            proposedText: "An assistant suggested leaving a job and starting a company.",
            informationType: "advice",
            subjectType: "unknown",
            subjectLabel: null,
            memoryDestination: "source_only",
            backgroundCategory: null,
            temporal: { state: "unknown", precision: "unknown", effectiveFrom: null, effectiveTo: null },
            evidence: exactEvidence(text, adviceQuote),
            confidence: 0.99,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "Assistant advice is retained with the source but is not user memory.",
          },
        ],
      });
    }
    case "importCustomSummary": {
      const { text } = importSegmentFromUser(user);
      const returnQuote = "Manchester return remains planned for 16 August 2026.";
      const qualificationQuote = "Alex's mortgage-advice qualification was completed in April 2026.";
      const conflictQuote = "A newer note says the return may instead be 30 August 2026.";
      const marriageQuote = "The exact legal marriage status remains unresolved.";
      return JSON.stringify({
        candidates: [
          {
            id: "return-date-reinforcement",
            classification: "reinforcement",
            canonicalKey: "relocation:manchester:return-date",
            proposedText: "Alex plans to return to Manchester on 16 August 2026.",
            informationType: "commitment",
            subjectType: "user",
            subjectLabel: null,
            memoryDestination: "background",
            backgroundCategory: "places",
            temporal: { state: "planned", precision: "exact", effectiveFrom: "2026-08-16", effectiveTo: null },
            evidence: exactEvidence(text, returnQuote),
            confidence: 0.96,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "The summary repeats the same dated plan.",
          },
          {
            id: "qualification-reinforcement",
            classification: "reinforcement",
            canonicalKey: "qualification:mortgage-advice:completed",
            proposedText: "Completed a mortgage-advice qualification in April 2026.",
            informationType: "event",
            subjectType: "user",
            subjectLabel: null,
            memoryDestination: "background",
            backgroundCategory: "work_qualifications",
            temporal: { state: "past", precision: "approximate", effectiveFrom: "2026-04-01", effectiveTo: null },
            evidence: exactEvidence(text, qualificationQuote),
            confidence: 0.93,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "The same qualification is repeated with lower date precision.",
          },
          {
            id: "return-date-conflict",
            classification: "conflict",
            canonicalKey: "relocation:manchester:return-date",
            proposedText: "A newer note gives 30 August 2026 as a possible return date.",
            informationType: "possibility",
            subjectType: "user",
            subjectLabel: null,
            memoryDestination: "possibility",
            backgroundCategory: null,
            temporal: { state: "unresolved", precision: "exact", effectiveFrom: "2026-08-30", effectiveTo: null },
            evidence: exactEvidence(text, conflictQuote),
            confidence: 0.87,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "The newer possible date conflicts with the established plan and needs review.",
          },
          {
            id: "marriage-status-reinforcement",
            classification: "reinforcement",
            canonicalKey: "relationship:legal-marriage-status",
            proposedText: "The exact legal marriage status remains unresolved.",
            informationType: "open_question",
            subjectType: "shared",
            subjectLabel: "Alex and his partner",
            memoryDestination: "background",
            backgroundCategory: "people",
            temporal: { state: "unresolved", precision: "unknown", effectiveFrom: null, effectiveTo: null },
            evidence: exactEvidence(text, marriageQuote),
            confidence: 0.96,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "The unresolved status is repeated rather than guessed.",
          },
        ],
      });
    }
    case "importIdeaExploration": {
      const { text } = importSegmentFromUser(user);
      const quote = "Maybe I could buy an EV9 and run private tours for Chinese visitors.";
      return JSON.stringify({
        candidates: [
          {
            id: "ev9-tour-exploration",
            classification: "new",
            canonicalKey: "business:ev9-private-tours",
            proposedText: "Exploring an EV9 private-tour business for Chinese visitors.",
            informationType: "possibility",
            subjectType: "user",
            subjectLabel: null,
            memoryDestination: "possibility",
            backgroundCategory: null,
            temporal: {
              state: "possible",
              precision: "unknown",
              effectiveFrom: null,
              effectiveTo: null,
            },
            evidence: exactEvidence(text, quote),
            confidence: 0.99,
            targetGoalIds: [],
            existingObservationId: null,
            rationale: "Explicitly exploratory language must remain a possibility, not a plan or chapter.",
          },
        ],
      });
    }
    case "importIdeaRejection": {
      const { text } = importSegmentFromUser(user);
      const quote = "On 2 August 2026, I decided not to pursue the EV9 private-tour business.";
      const existingPossibility = importObservationsFromUser(user).find((observation) =>
        observation.canonicalText.toLocaleLowerCase().includes("ev9"),
      );
      return JSON.stringify({
        candidates: [
          {
            id: "ev9-tour-rejection",
            classification: "update",
            canonicalKey: "business:ev9-private-tours",
            proposedText: "Decided not to pursue the EV9 private-tour business.",
            informationType: "decision",
            subjectType: "user",
            subjectLabel: null,
            memoryDestination: "possibility",
            backgroundCategory: null,
            temporal: {
              state: "past",
              precision: "exact",
              effectiveFrom: "2026-08-02",
              effectiveTo: null,
            },
            evidence: exactEvidence(text, quote),
            confidence: 0.99,
            targetGoalIds: [],
            existingObservationId: existingPossibility?.id ?? null,
            rationale: "The explicit decision closes the existing possibility without creating a chapter.",
          },
        ],
      });
    }
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
