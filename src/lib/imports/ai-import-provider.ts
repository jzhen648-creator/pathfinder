import { generateJsonCompletion } from "@/lib/ai-client";
import {
  assertExtractionEvidenceMatchesSegment,
  ImportProviderOutputError,
  normalizeExtractionEvidenceOffsets,
  parseImportExtractionResult,
} from "./extraction-contract";

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
  "For memoryDestination chapter: either target one or more supplied goal IDs in targetGoalIds, or classify it as new_chapter with no targetGoalIds plus chapterTitle, primaryThemeId, and a proposed groupName. Never emit a chapter destination with an empty targetGoalIds array for any other classification.",
  "Use classification new_chapter only when the source clearly describes a meaningful evolving situation that does not match an existing chapter. Supply a concise chapterTitle, one primaryThemeId (becoming, pleasures, finance, health, work, or people), and a concise groupName. Never create a chapter from possibility, advice, interpretation, or another person's information.",
  "For a first-import snapshot, groupName must reuse the named active-area heading that contains the chapter. This preserves the person's own organisation. For an ordinary conversation with no named area, use chapterTitle as groupName. Never derive groupName from theme or broad taxonomy.",
  "When existing_life_model.goals is empty, every durable user-owned active situation sent to memoryDestination chapter must be a complete new_chapter candidate. Reuse a specific source heading as chapterTitle when one exists. Never emit classification new, update, conflict, or reinforcement with memoryDestination chapter and no targetGoalIds.",
  "Valid empty-model chapter example: { classification: 'new_chapter', memoryDestination: 'chapter', chapterTitle: 'Qualify as a mortgage adviser', primaryThemeId: 'work', groupName: 'Build my London career', targetGoalIds: [] }. The words new_chapter belong only in classification, never in memoryDestination.",
  "A bounded experiment can be a new chapter when the user has already taken concrete action and committed a next step, even though its business outcome is unproven. Describe the experiment, not an assumed successful business.",
  "Preserve uncertainty and time. A missing date is unknown, never current by default. effectiveFrom/effectiveTo are ISO dates or timestamps, or null.",
  "Every candidate must include one to five evidence quotes copied verbatim as one contiguous substring of the supplied segment, including its original punctuation. Evidence is never a summary, paraphrase, joined passage, or ellipsis. If exact character counting is uncertain, use startOffset 0 and endOffset equal to quote.length; the server will relocate a unique exact quote and reject missing or ambiguous quotes.",
  "Use only these exact lowercase enum values: classification = new, reinforcement, update, conflict, possible_connection, new_chapter, no_durable_value, uncertain; informationType = fact, event, aspiration, decision, commitment, possibility, tension, open_question, preference, context, interpretation, advice; subjectType = user, other_person, shared, unknown; memoryDestination = chapter, background, possibility, source_only; backgroundCategory = identity, people, places, work_qualifications, assets_finances, health, preferences_constraints, other; temporal.state = past, current, ongoing, planned, possible, unresolved, unknown; temporal.precision = exact, approximate, range, ongoing, unknown; evidence.role = supports or contradicts; evidence.supportType = explicit, inferred, or user_confirmed.",
  "Identity is a backgroundCategory, not an informationType. Use informationType fact or context for an explicit durable identity statement.",
  "Do not put informationType values such as decision, commitment, fact, event, or identity in classification. Classification describes reconciliation; informationType describes meaning.",
  "An unresolved plan involving the user's partner or household is shared background or source_only, not solely a user-owned fact and not an active chapter unless the source confirms action.",
  "A rejected purchase, refusal, or decision not to act is background with preferences_constraints when durably useful, or source_only when it only negates advice. It is never an untargeted chapter update.",
  "targetGoalIds may contain only exact IDs supplied in existing_life_model.goals; otherwise use an empty array. existingObservationId may contain only an exact supplied observation ID; otherwise omit it.",
  "Compare every meaning against existing_life_model.observations. When the source repeats the same current meaning without changing scope, time, status, or commitment, classify it as reinforcement and set existingObservationId to the exact supplied observation ID. Do not restate already-known meaning as new or update.",
  "Reinforcement is quiet provenance, not a review decision. Use update only for a material difference from the existing observation. A negative absence such as no offer yet or not accepted yet that merely qualifies a real event belongs inside that event update or may be omitted; do not emit it as a separate new fact unless the source describes a durable decision or reverses existing meaning.",
  "Before returning JSON, validate every candidate: uncertain and no_durable_value must use source_only; a non-new_chapter chapter destination must contain a supplied goal ID; new_chapter must contain chapterTitle, primaryThemeId, groupName, and no target IDs; background must contain backgroundCategory. Omit any candidate you cannot make valid instead of guessing.",
  "Return only material durable meanings: normally three to eight candidates and never more than ten per segment. Merge repeated sentences in the segment instead of emitting duplicates.",
  "When space is limited, prioritize durable identity/background, material changes, conflicts, explicit decisions, and commitments. Merge related clauses for the same chapter instead of spending separate candidates on each clause. Idle speculation and rejected advice may be omitted when they create no durable meaning, but must never become facts or chapters.",
  "Keep proposedText under 240 characters and rationale under 160 characters. Omit optional null fields and omit rationale when it adds no review value. Never invent chapter or observation IDs.",
  "Output JSON only: { candidates: [{ id, classification, canonicalKey, proposedText, chapterTitle, primaryThemeId, groupName, informationType, subjectType, subjectLabel, memoryDestination, backgroundCategory, temporal: { state, precision, effectiveFrom, effectiveTo }, evidence: [{ startOffset, endOffset, quote, role, supportType }], confidence, targetGoalIds, existingObservationId, rationale }] }. chapterTitle, primaryThemeId, and groupName are valid only for new_chapter and otherwise must be null or omitted.",
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

function validateImportProviderContent(content: string, segmentText: string): unknown {
  const parsed = parseImportExtractionResult(parseImportProviderContent(content));
  return assertExtractionEvidenceMatchesSegment(
    normalizeExtractionEvidenceOffsets(parsed, segmentText),
    segmentText,
  );
}

function extractionUserMessage(
  input: ImportSegmentProviderInput,
  correction?: string,
): string {
  return [
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
    correction ? `<provider_correction>${correction}</provider_correction>` : null,
  ]
    .filter((part): part is string => part !== null)
    .join("\n");
}

async function generateImportExtraction(
  input: ImportSegmentProviderInput,
  correction?: string,
): Promise<string> {
  return generateJsonCompletion({
    system: IMPORT_EXTRACTION_SYSTEM,
    queueKey: input.userId,
    maxTokens: 4_500,
    temperature: correction ? 0 : 0.1,
    user: extractionUserMessage(input, correction),
  });
}

export const aiImportExtractionProvider: ImportExtractionProvider = {
  async extractSegment(input) {
    const content = await generateImportExtraction(input);
    try {
      if (!content) throw new ImportProviderResponseParseError("");
      return validateImportProviderContent(content, input.segmentText);
    } catch (error) {
      if (
        !(error instanceof ImportProviderResponseParseError) &&
        !(error instanceof ImportProviderOutputError)
      ) {
        throw error;
      }
      const corrected = await generateImportExtraction(
        input,
        "The previous response was rejected because it did not satisfy the extraction contract. Re-extract from the supplied source. Return only a complete valid result. In particular, when there are no existing goals, every chapter candidate must use classification new_chapter and include a source-grounded chapterTitle, one valid primaryThemeId, a groupName copied from its named active-area heading or falling back to chapterTitle, and an empty targetGoalIds array. Omit any candidate you cannot make valid; do not invent missing life information.",
      );
      if (!corrected) throw new ImportProviderResponseParseError("");
      return validateImportProviderContent(corrected, input.segmentText);
    }
  },
};
