import { generateJsonCompletion } from "@/lib/ai-client";

export type ImportProviderContext = {
  goals: Array<{ id: string; title: string; background: string | null }>;
  observations: Array<{ id: string; kind: string; canonicalText: string }>;
};

export type ImportSegmentProviderInput = {
  userId: string;
  sourceId: string;
  segmentPosition: number;
  segmentText: string;
  context: ImportProviderContext;
};

export interface ImportExtractionProvider {
  extractSegment(input: ImportSegmentProviderInput): Promise<unknown>;
}

const IMPORT_EXTRACTION_SYSTEM = [
  "You extract bounded life-memory candidates from one exact source segment.",
  "Classify meaning; do not turn quoted advice, hypotheticals, another person's details, or assistant suggestions into the user's facts or commitments.",
  "Classify demonstrated actions, completed steps, applications, bookings, and measured progress as event, fact, decision, or commitment—not aspiration merely because they support a larger goal.",
  "Use subjectType and subjectLabel to preserve who information is about. Every other_person candidate requires a concise non-empty subjectLabel such as partner, brother, father, or manager; omit that candidate rather than returning other_person without a label. Use source_only when meaning is unsafe or not durable.",
  "Use background for durable context that should support chapters without becoming a map node; use chapter only for a meaningful active chapter change.",
  "Explicit, user-owned identity, language, home-base, qualification, relationship, asset, and enduring constraint statements are eligible background context when durable; do not omit them merely because they are not actions.",
  "A relocation, home-base, or travel date with no matching supplied chapter belongs in background with backgroundCategory places; it is not an untargeted chapter update.",
  "For memoryDestination chapter: either target one or more supplied goal IDs in targetGoalIds, or classify it as new_chapter with no targetGoalIds plus chapterTitle and primaryThemeId. Never emit a chapter destination with an empty targetGoalIds array for any other classification.",
  "Use classification new_chapter only when the source clearly describes a meaningful evolving situation that does not match an existing chapter. Supply a concise chapterTitle and one primaryThemeId: becoming, pleasures, finance, health, work, or people. Never create a chapter from possibility, advice, interpretation, or another person's information.",
  "A bounded experiment can be a new chapter when the user has already taken concrete action and committed a next step, even though its business outcome is unproven. Describe the experiment, not an assumed successful business.",
  "Preserve uncertainty and time. A missing date is unknown, never current by default. effectiveFrom/effectiveTo are ISO dates or timestamps, or null.",
  "Every candidate must include one to five evidence quotes copied verbatim as one contiguous substring of the supplied segment, including its original punctuation. Evidence is never a summary, paraphrase, joined passage, or ellipsis. If exact character counting is uncertain, use startOffset 0 and endOffset equal to quote.length; the server will relocate a unique exact quote and reject missing or ambiguous quotes.",
  "Use only these exact lowercase enum values: classification = new, reinforcement, update, conflict, possible_connection, new_chapter, no_durable_value, uncertain; informationType = fact, event, aspiration, decision, commitment, possibility, tension, open_question, preference, context, interpretation, advice; subjectType = user, other_person, shared, unknown; memoryDestination = chapter, background, possibility, source_only; backgroundCategory = identity, people, places, work_qualifications, assets_finances, health, preferences_constraints, other; temporal.state = past, current, ongoing, planned, possible, unresolved, unknown; temporal.precision = exact, approximate, range, ongoing, unknown; evidence.role = supports or contradicts; evidence.supportType = explicit, inferred, or user_confirmed.",
  "Identity is a backgroundCategory, not an informationType. Use informationType fact or context for an explicit durable identity statement.",
  "Do not put informationType values such as decision, commitment, fact, event, or identity in classification. Classification describes reconciliation; informationType describes meaning.",
  "An unresolved plan involving the user's partner or household is shared background or source_only, not solely a user-owned fact and not an active chapter unless the source confirms action.",
  "A rejected purchase, refusal, or decision not to act is background with preferences_constraints when durably useful, or source_only when it only negates advice. It is never an untargeted chapter update.",
  "targetGoalIds may contain only exact IDs supplied in existing_life_model.goals; otherwise use an empty array. existingObservationId may contain only an exact supplied observation ID; otherwise omit it.",
  "Before returning JSON, validate every candidate: uncertain and no_durable_value must use source_only; a non-new_chapter chapter destination must contain a supplied goal ID; new_chapter must contain chapterTitle and primaryThemeId and no target IDs; background must contain backgroundCategory. Omit any candidate you cannot make valid instead of guessing.",
  "Return only material durable meanings: normally three to eight candidates and never more than ten per segment. Merge repeated sentences in the segment instead of emitting duplicates.",
  "When space is limited, prioritize durable identity/background, material changes, conflicts, explicit decisions, and commitments. Merge related clauses for the same chapter instead of spending separate candidates on each clause. Idle speculation and rejected advice may be omitted when they create no durable meaning, but must never become facts or chapters.",
  "Keep proposedText under 240 characters and rationale under 160 characters. Omit optional null fields and omit rationale when it adds no review value. Never invent chapter or observation IDs.",
  "Output JSON only: { candidates: [{ id, classification, canonicalKey, proposedText, chapterTitle, primaryThemeId, informationType, subjectType, subjectLabel, memoryDestination, backgroundCategory, temporal: { state, precision, effectiveFrom, effectiveTo }, evidence: [{ startOffset, endOffset, quote, role, supportType }], confidence, targetGoalIds, existingObservationId, rationale }] }. chapterTitle and primaryThemeId are required only for new_chapter and otherwise must be null or omitted.",
].join(" ");

export class ImportProviderResponseParseError extends Error {
  readonly code = "INVALID_PROVIDER_JSON";
  readonly contentLength: number;
  readonly lookedFenced: boolean;
  readonly lookedComplete: boolean;

  constructor(content: string) {
    const trimmed = content.trim();
    super(
      `The import provider returned invalid JSON (length=${content.length}, fenced=${trimmed.startsWith("```")}, complete=${trimmed.endsWith("}")}).`,
    );
    this.name = "ImportProviderResponseParseError";
    this.contentLength = content.length;
    this.lookedFenced = trimmed.startsWith("```");
    this.lookedComplete = trimmed.endsWith("}");
  }
}

/** Accept a JSON object and defensively unwrap one provider-added Markdown fence. */
export function parseImportProviderContent(content: string): unknown {
  const trimmed = content.trim();
  const unwrapped = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  try {
    return JSON.parse(unwrapped) as unknown;
  } catch {
    // Do not include provider output because imported sources may be private.
    throw new ImportProviderResponseParseError(content);
  }
}

export const aiImportExtractionProvider: ImportExtractionProvider = {
  async extractSegment(input) {
    const content = await generateJsonCompletion({
      system: IMPORT_EXTRACTION_SYSTEM,
      queueKey: input.userId,
      maxTokens: 4_500,
      temperature: 0.1,
      user: [
        "<import_segment>",
        JSON.stringify({
          sourceId: input.sourceId,
          position: input.segmentPosition,
          text: input.segmentText,
        }),
        "</import_segment>",
        "<existing_life_model>",
        JSON.stringify(input.context),
        "</existing_life_model>",
      ].join("\n"),
    });

    if (!content) throw new ImportProviderResponseParseError("");
    return parseImportProviderContent(content);
  },
};
