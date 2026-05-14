import { z } from "zod";
import {
  GroqNotConfiguredError,
  generateJsonCompletion,
  hasGroqKey,
} from "@/lib/groq";
import {
  buildFallbackRoadmap,
  type GeneratedRoadmap,
} from "@/lib/milestone-generator";

export const evolveProposalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000),
  targetDate: z.string().nullable(),
  milestoneTitles: z.array(z.string().min(1).max(200)).min(2).max(6),
});

export type EvolveGoalProposal = z.infer<typeof evolveProposalSchema>;

export type EvolveProposalInput = {
  parentTitle: string;
  parentDescription: string;
  parentLifeArea: string;
  completedMilestoneTitles: string[];
  whatsDifferent?: string;
  correction?: string;
  previousProposal?: EvolveGoalProposal;
  profileContext?: string;
};

const PROPOSE_SYSTEM = [
  "You propose the next chapter of a completed life goal as structured JSON.",
  "Return ONLY a JSON object with:",
  "title (string), description (string, 1-3 sentences),",
  "targetDate (ISO date YYYY-MM-DD if a deadline is implied, else null),",
  "milestoneTitles (array of 3-5 short phase titles for the NEW goal only).",
  "The continuation should honor what was finished but reflect what is different now.",
  "If correction is provided, revise previousProposal rather than repeating the mistake.",
  "No markdown, no extra keys.",
].join(" ");

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
}

function buildUserMessage(input: EvolveProposalInput): string {
  const lines = [
    `Parent goal title: ${input.parentTitle}`,
    `Parent description: ${input.parentDescription || "(none)"}`,
    `Life area: ${input.parentLifeArea}`,
    `Completed milestones: ${input.completedMilestoneTitles.length ? input.completedMilestoneTitles.join(" · ") : "(none listed)"}`,
  ];
  if (input.whatsDifferent?.trim()) {
    lines.push("", "What is different in this next chapter:", input.whatsDifferent.trim());
  }
  if (input.previousProposal && input.correction?.trim()) {
    lines.push(
      "",
      "Previous proposal (user rejected):",
      JSON.stringify(input.previousProposal),
      "",
      "User correction:",
      input.correction.trim(),
    );
  }
  if (input.profileContext?.trim()) {
    lines.push("", "User profile context:", input.profileContext.trim());
  }
  return lines.join("\n");
}

function proposalToRoadmap(proposal: EvolveGoalProposal, lifeArea: string): GeneratedRoadmap {
  const deadline = proposal.targetDate?.trim() || "No fixed deadline";
  return buildFallbackRoadmap({
    title: proposal.title,
    description: proposal.description || proposal.title,
    lifeArea,
    startingPoint: "Continuing from the completed chapter",
    biggestObstacle: "Staying consistent with the new direction",
    hoursPerWeek: "A few hours per week",
    deadline,
    profileContext: undefined,
  });
}

/** Overlay AI milestone titles onto fallback roadmap shape (same row count, capped at 5). */
export function roadmapFromEvolveProposal(
  proposal: EvolveGoalProposal,
  lifeArea: string,
): GeneratedRoadmap {
  const base = proposalToRoadmap(proposal, lifeArea);
  const titles = proposal.milestoneTitles.slice(0, base.milestones.length);
  if (base.goalType === "action") {
    return {
      ...base,
      milestones: base.milestones.map((m, i) => ({
        ...m,
        title: titles[i]?.trim() || m.title,
        description: titles[i]
          ? `Phase: ${titles[i]!.trim()}`
          : m.description,
      })),
    };
  }
  return {
    ...base,
    milestones: base.milestones.map((m, i) => ({
      ...m,
      title: titles[i]?.trim() || m.title,
      description: titles[i] ? `Phase: ${titles[i]!.trim()}` : m.description,
    })),
  };
}

export async function generateEvolveProposal(
  input: EvolveProposalInput,
): Promise<{ proposal: EvolveGoalProposal; usedFallback: boolean }> {
  const fallbackFromParent = (): EvolveGoalProposal => {
    const title = input.previousProposal?.title?.trim() || `Next: ${input.parentTitle}`.slice(0, 200);
    const description =
      input.correction?.trim() ||
      input.whatsDifferent?.trim() ||
      input.previousProposal?.description ||
      `Continue the journey after completing “${input.parentTitle}”.`;
    const roadmap = buildFallbackRoadmap({
      title,
      description,
      lifeArea: input.parentLifeArea,
      startingPoint: "Building on what was completed",
      biggestObstacle: "Clarity on the next chapter",
      hoursPerWeek: "A few hours per week",
      deadline: "No fixed deadline",
    });
    return {
      title,
      description: description.slice(0, 5000),
      targetDate: null,
      milestoneTitles: roadmap.milestones.slice(0, 5).map((m) => m.title),
    };
  };

  if (!hasGroqKey()) {
    return { proposal: fallbackFromParent(), usedFallback: true };
  }

  try {
    const raw = await generateJsonCompletion({
      system: PROPOSE_SYSTEM,
      user: buildUserMessage(input),
      maxTokens: 800,
      temperature: input.correction ? 0.35 : 0.25,
    });
    if (!raw) return { proposal: fallbackFromParent(), usedFallback: true };
    const json = JSON.parse(stripJsonFence(raw)) as unknown;
    const parsed = evolveProposalSchema.safeParse(json);
    if (!parsed.success) return { proposal: fallbackFromParent(), usedFallback: true };
    return { proposal: parsed.data, usedFallback: false };
  } catch (err) {
    if (err instanceof GroqNotConfiguredError) {
      return { proposal: fallbackFromParent(), usedFallback: true };
    }
    console.error("[generateEvolveProposal]", err);
    return { proposal: fallbackFromParent(), usedFallback: true };
  }
}
