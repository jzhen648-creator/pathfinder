import type { DomainHubData } from "./tree-types";
import { threadHasNonSyntheticMoments } from "./tree-renderer-grammar";

export {
  goalLayoutGrammarForThread,
  lifeAreaUsesDomainClusterGoalLayout,
  LIFE_AREA_IDS_DOMAIN_CLUSTER_GOALS,
  shouldDomainClusterThread,
  threadHasNonSyntheticMoments,
  type GoalLayoutGrammar,
} from "./tree-renderer-grammar";

/**
 * @deprecated Use {@link threadHasNonSyntheticMoments} — inverted naming was confusing.
 */
export function threadMomentsBlockPeopleDomainCluster(thread: DomainHubData): boolean {
  return threadHasNonSyntheticMoments(thread);
}
