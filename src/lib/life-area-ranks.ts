import { unstable_cache } from "next/cache";
import { lifeWheelAreas, type LifeWheelAreaSummary } from "@/lib/life-wheel";
import { generateStructured, hasGroqKey } from "@/lib/groq";

const rankTracks: Record<string, [string, string, string, string, string]> = {
  careerPurpose: ["Foundations", "Building", "Emerging", "Established", "Expert"],
  finances: ["Surviving", "Stabilising", "Growing", "Secure", "Wealthy"],
  healthFitness: ["Starting Out", "Active", "Consistent", "Athletic", "Peak"],
  relationships: ["Isolated", "Connecting", "Bonding", "Strong", "Thriving"],
  personalGrowth: ["Awakening", "Developing", "Progressing", "Flourishing", "Mastery"],
  mentalWellbeing: ["Struggling", "Stabilising", "Balanced", "Grounded", "Flourishing"],
  funRecreation: ["Dormant", "Exploring", "Active", "Vibrant", "Thriving"],
  environmentLifestyle: ["Unsettled", "Stabilising", "Comfortable", "Optimised", "Flourishing"],
};

export type LifeAreaRankSummary = {
  key: string;
  label: string;
  score: number;
  rank: string;
  goalsCount: number;
};

export function getRankFromScore(areaKey: string, score: number) {
  const track = rankTracks[areaKey] ?? rankTracks.personalGrowth;
  if (score < 2) return track[0];
  if (score < 4) return track[1];
  if (score < 6) return track[2];
  if (score < 8) return track[3];
  return track[4];
}

export function buildLifeAreaRankSummary(areas: LifeWheelAreaSummary[]) {
  return areas
    .map((area) => ({
      key: area.key,
      label: area.label,
      score: area.score,
      rank: getRankFromScore(area.key, area.score),
      goalsCount: area.goals.length,
    }))
    .filter((area) => area.goalsCount > 0);
}

function buildFallbackTitle(ranks: LifeAreaRankSummary[]) {
  if (ranks.length === 0) return "The New Pathfinder";
  const strongest = [...ranks].sort((a, b) => b.score - a.score)[0];
  const weakest = [...ranks].sort((a, b) => a.score - b.score)[0];
  const strongWord =
    strongest.score >= 7 ? "Rising" : strongest.score >= 5 ? "Steady" : "Early";
  const weakWord = weakest.score <= 3 ? "Builder" : "Architect";
  return `The ${strongWord} ${weakWord}`;
}

export async function getDynamicLifeTitle(input: {
  userId: string;
  ranks: LifeAreaRankSummary[];
}) {
  const signature = input.ranks.map((r) => `${r.key}:${r.rank}:${r.score.toFixed(1)}`).join("|") || "none";
  const getCached = unstable_cache(
    async () => {
      if (!hasGroqKey()) {
        return {
          title: buildFallbackTitle(input.ranks),
          rationale: "Generated from your current strongest and weakest life area ranks.",
        };
      }
      try {
        const parsed = await generateStructured<{ title: string; rationale: string }>({
          system:
            "Create an honest, evocative 2-4 word life title from rank mix. Also return one short sentence explaining which areas most influenced it.",
          user: `Life area ranks:\n${input.ranks
            .map((r) => `${r.label}: ${r.rank} (${r.score.toFixed(1)}/10)`)
            .join("\n")}`,
          toolName: "submit_life_title",
          toolDescription: "Submit a short evocative life title and a one-sentence rationale.",
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              rationale: { type: "string" },
            },
            required: ["title", "rationale"],
          },
          maxTokens: 200,
        });
        return {
          title: parsed.title?.trim() || buildFallbackTitle(input.ranks),
          rationale:
            parsed.rationale?.trim() ||
            "Generated from your current strongest and weakest life area ranks.",
        };
      } catch (err) {
        console.error("[life-area-ranks] Groq call failed:", err);
        return {
          title: buildFallbackTitle(input.ranks),
          rationale: "Generated from your current strongest and weakest life area ranks.",
        };
      }
    },
    ["dynamic-life-title", input.userId, signature],
    { revalidate: 60 * 60 * 24 * 7 },
  );
  return getCached();
}

export function getRankForLifeAreaLabel(label: string, areas: LifeWheelAreaSummary[]) {
  const areaByLabel = areas.find((area) => {
    const normalized = label.toLowerCase();
    const match = lifeWheelAreas.find((base) => base.key === area.key);
    return normalized.includes(area.label.toLowerCase()) || match?.aliases.some((a) => normalized.includes(a));
  });
  if (!areaByLabel) return null;
  return getRankFromScore(areaByLabel.key, areaByLabel.score);
}
