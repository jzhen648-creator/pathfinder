import type { FormattedPursuitContext } from "@/lib/ai/format-map-context";
import { buildFocalPursuitReadingFacts } from "@/lib/map/compile-reading-packet";

export function buildPursuitEnrichInsightContext(context: FormattedPursuitContext): {
  focalFacts: string[];
  focalFactsJson: string;
  scopedChapterJson: string;
  confirmedOnContextTabJson: string;
} {
  const { enrichAnswers, ...pursuitWithoutEnrich } = context.pursuit;
  const focalFacts = buildFocalPursuitReadingFacts(context.pursuit);

  return {
    focalFacts,
    focalFactsJson: JSON.stringify(
      {
        pursuitId: context.pursuit.id,
        title: context.pursuit.title,
        facts: focalFacts,
      },
      null,
      2,
    ),
    scopedChapterJson: JSON.stringify(
      {
        pursuit: pursuitWithoutEnrich,
        siblingPursuits: context.siblingPursuits,
        siblingMarks: context.siblingMarks,
      },
      null,
      2,
    ),
    confirmedOnContextTabJson: JSON.stringify(enrichAnswers ?? [], null, 2),
  };
}
