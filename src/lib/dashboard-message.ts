import { unstable_cache } from "next/cache";
import { generateText, hasGroqKey } from "@/lib/groq";

type DashboardMessageInput = {
  userId: string;
  name: string;
  activeGoals: string[];
  totalXp: number;
  rankSummary: string;
  tasksCompletedThisWeek: number;
  recentlyCompletedMilestones: string[];
  profileContext: string;
};

function buildFallbackMessage(input: DashboardMessageInput) {
  const name = input.name || "there";
  const activeCount = input.activeGoals.length;
  const milestoneLine =
    input.recentlyCompletedMilestones.length > 0
      ? ` Recent milestone: ${input.recentlyCompletedMilestones[0]}.`
      : "";

  return `${name}, you have ${input.totalXp} XP, ${activeCount} active goal${activeCount === 1 ? "" : "s"}, and ${input.tasksCompletedThisWeek} task${input.tasksCompletedThisWeek === 1 ? "" : "s"} completed this week.${milestoneLine}`;
}

async function generateMessage(input: DashboardMessageInput) {
  if (!hasGroqKey()) {
    return buildFallbackMessage(input);
  }

  const activeGoals = input.activeGoals.length > 0 ? input.activeGoals.join(", ") : "None";
  const milestones =
    input.recentlyCompletedMilestones.length > 0
      ? input.recentlyCompletedMilestones.join(", ")
      : "None";

  try {
    const text = await generateText({
      system:
        "You write concise productivity coaching copy. Return exactly 2 sentences, specific to provided data, professional tone, no emojis, no markdown.",
      messages: [
        {
          role: "user",
          content: `Name: ${input.name}
Active goals: ${activeGoals}
Total XP: ${input.totalXp}
Life area rank summary: ${input.rankSummary}
Tasks completed this week: ${input.tasksCompletedThisWeek}
Recently completed milestones: ${milestones}

Personal profile context:
${input.profileContext || "No profile context yet."}`,
        },
      ],
      maxTokens: 220,
    });
    return text || buildFallbackMessage(input);
  } catch (err) {
    console.error("[dashboard-message] Groq call failed:", err);
    return buildFallbackMessage(input);
  }
}

export async function getDailyDashboardMessage(input: DashboardMessageInput) {
  const dateKey = new Date().toISOString().slice(0, 10);

  const getCachedMessage = unstable_cache(
    async () => generateMessage(input),
    ["dashboard-ai-message", input.userId, dateKey],
    { revalidate: 60 * 60 * 24 },
  );

  return getCachedMessage();
}
