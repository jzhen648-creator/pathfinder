import type { FormattedPursuitContext } from "@/lib/ai/format-map-context";
import { buildFocalPursuitReadingFacts } from "@/lib/map/compile-reading-packet";

export function buildPursuitEnrichInsightContext(
  context: FormattedPursuitContext,
  dateOfBirth: Date | null = null,
): {
  focalFacts: string[];
  focalFactsJson: string;
  scopedChapterJson: string;
  confirmedOnContextTabJson: string;
} {
  const { enrichAnswers, ...pursuitWithoutEnrich } = context.pursuit;
  const focalFacts = buildFocalPursuitReadingFacts(context.pursuit, Date.now(), dateOfBirth);

  return {
    focalFacts,
    focalFactsJson: JSON.stringify({
      pursuitId: context.pursuit.id,
      title: context.pursuit.title,
      facts: focalFacts,
    }),
    scopedChapterJson: JSON.stringify({
      pursuit: pursuitWithoutEnrich,
      siblingPursuits: context.siblingPursuits,
      siblingMarks: context.siblingMarks,
    }),
    confirmedOnContextTabJson: JSON.stringify(enrichAnswers ?? []),
  };
}
