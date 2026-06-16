import type { InsightLevelPayload } from "@/lib/insights/insight-types";
import {
  gateThemeContextual,
  pursuitSignalFromGoal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { prisma } from "@/lib/prisma";

/** Strip theme contextual benchmarks when no pursuit in the theme has enough user context. */
export async function gateThemeInsightsPatch(
  userId: string,
  themes: Record<string, InsightLevelPayload>,
): Promise<Record<string, InsightLevelPayload>> {
  const themeIds = Object.keys(themes);
  if (themeIds.length === 0) return themes;

  const goals = await prisma.goal.findMany({
    where: {
      userId,
      archived: false,
      OR: [
        { themeId: { in: themeIds } },
        { themeId: null, lifeArea: { in: themeIds } },
      ],
    },
    select: {
      themeId: true,
      lifeArea: true,
      title: true,
      description: true,
      enrichAnswers: true,
      deadline: true,
      status: true,
      targetAmount: true,
      milestones: { select: { completedAt: true } },
    },
  });

  const signalsByTheme = new Map<string, ReturnType<typeof pursuitSignalFromGoal>[]>();
  for (const goal of goals) {
    const themeId = goal.themeId ?? goal.lifeArea;
    const list = signalsByTheme.get(themeId) ?? [];
    list.push(pursuitSignalFromGoal(goal));
    signalsByTheme.set(themeId, list);
  }

  const gated: Record<string, InsightLevelPayload> = {};
  for (const [themeId, entry] of Object.entries(themes)) {
    gated[themeId] = {
      ...entry,
      contextual: gateThemeContextual(
        entry.contextual?.trim() ?? "",
        signalsByTheme.get(themeId) ?? [],
      ),
    };
  }
  return gated;
}
