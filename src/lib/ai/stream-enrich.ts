import { z } from "zod";
import { generateJsonCompletion } from "@/lib/gemini";

const enrichResultSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

export type StreamEnrichItemType = "mark" | "pursuit";

const ENRICH_SYSTEM_PROMPT = [
  "You enrich sparse Pathfinder life-map items from a short user note.",
  "Return ONLY valid JSON: { \"title\": string, \"description\": string }.",
  "",
  "Rules:",
  "- Preserve the user's intent; expand vague titles into clear, specific language.",
  "- title: concise user-facing label.",
  "- For marks: title MUST be at most 7 words.",
  "- For pursuits: title at most 100 characters.",
  "- description: 1–3 sentences, concrete and personal, no bullet lists.",
  "- Do not invent dates, amounts, or facts not implied by the input.",
  "- No markdown, no commentary outside JSON.",
].join("\n");

export async function runStreamEnrich(input: {
  itemType: StreamEnrichItemType;
  currentTitle: string;
  hubLabel?: string | null;
  themeLabel?: string | null;
  additionalContext: string;
}): Promise<{ title: string; description: string }> {
  const placement =
    input.hubLabel && input.themeLabel
      ? `Hub: ${input.hubLabel}\nTheme: ${input.themeLabel}`
      : input.hubLabel
        ? `Hub: ${input.hubLabel}`
        : input.themeLabel
          ? `Theme: ${input.themeLabel}`
          : "Placement: unknown";

  const user = [
    `Item type: ${input.itemType}`,
    placement,
    `Current title: ${input.currentTitle.trim()}`,
    "",
    "User's additional context:",
    input.additionalContext.trim(),
  ].join("\n");

  const raw = await generateJsonCompletion({
    system: ENRICH_SYSTEM_PROMPT,
    user,
    maxTokens: 512,
    temperature: 0.35,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Enrich response was not valid JSON.");
  }

  const result = enrichResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Enrich response did not match expected shape.");
  }

  let title = result.data.title.trim();
  let description = result.data.description.trim();

  if (input.itemType === "mark") {
    title = title.split(/\s+/).slice(0, 7).join(" ");
  } else {
    title = title.slice(0, 100);
  }
  description = description.slice(0, 500);

  if (!title || !description) {
    throw new Error("Enrich produced empty title or description.");
  }

  return { title, description };
}
