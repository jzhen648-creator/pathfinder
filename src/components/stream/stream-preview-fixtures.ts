import { layoutStreamPreview } from "@/components/stream/stream-preview-layout";
import type { PreviewLayoutInput } from "@/components/stream/stream-preview-layout";
import {
  createDevPreviewBaseThread,
  type ApprovedStreamItems,
  type PreviewMomentNode,
  type PreviewTreeGoalNode,
} from "@/components/stream/stream-hub-preview-data";
import type { DomainHubData } from "@/components/tree/tree-types";
import type { ExtractedMark, ExtractedMilestone, ExtractedPursuit } from "@/types/stream";

export const CAREER_EXISTING_GOAL_IDS = {
  headOfProduct: "existing-head-of-product",
  personalBrand: "existing-personal-brand",
  book: "existing-book",
} as const;

/** Stream-approved preview pursuits only — committed hub data lives in {@link createCareerHubDevBaseThread}. */
export const STREAM_PREVIEW_FIXTURE_CAREER: PreviewLayoutInput = {
  hubLabel: "Career",
  marks: [],
  pursuits: [
    {
      queueId: "p-conferences",
      title: "Speak at product conferences",
      clientKey: "p-conferences",
      bloomStatus: "ACTIVE",
      goalType: "project",
    },
    {
      queueId: "p-coach",
      title: "Get executive presence coach",
      clientKey: "p-coach",
      bloomStatus: "ACTIVE",
      goalType: "project",
      parentExistingGoalId: CAREER_EXISTING_GOAL_IDS.headOfProduct,
    },
    {
      queueId: "p-deck",
      title: "Create portfolio case study deck",
      clientKey: "p-deck",
      bloomStatus: "ACTIVE",
      goalType: "project",
    },
  ],
  milestones: [],
};

/** @deprecated Use {@link STREAM_PREVIEW_FIXTURE_CAREER}. */
export const STREAM_PREVIEW_FIXTURE_RICH = STREAM_PREVIEW_FIXTURE_CAREER;

export const STREAM_PREVIEW_FIXTURE_MINIMAL: PreviewLayoutInput = {
  hubLabel: "Career",
  marks: [],
  pursuits: [
    {
      queueId: "p1",
      title: "Speak at product conferences",
      clientKey: "p-conferences",
      bloomStatus: "ACTIVE",
      goalType: "project",
    },
  ],
  milestones: [],
};

function committedGoal(
  branchId: string,
  id: string,
  title: string,
  bloomStatus: PreviewTreeGoalNode["bloomStatus"],
): PreviewTreeGoalNode {
  return {
    id,
    branchId,
    title,
    shortLabel: null,
    description: null,
    year: null,
    createdAtIso: null,
    timelineStartIso: null,
    deadlineIso: null,
    bloomStatus,
    positionAngle: null,
    parentGoalId: null,
    forkedGoalIds: [],
    milestones: [],
    orbitalMilestones: [],
    significanceTier: null,
    childGoals: [],
    isPreview: false,
  };
}

function committedMark(
  branchId: string,
  id: string,
  label: string,
  calendarDateIso: string,
): PreviewMomentNode {
  const year = Number.parseInt(calendarDateIso.slice(0, 4), 10);
  return {
    id,
    branchId,
    label,
    description: null,
    year: Number.isFinite(year) ? year : null,
    significance: 1,
    bloomStatus: "COMPLETE",
    isTurningPoint: false,
    future: false,
    value: null,
    type: "achievement",
    calendarDateIso,
    isPreview: false,
  };
}

/** Committed Career hub thread (full-opacity nodes). */
export function createCareerHubDevBaseThread(branchId: string): DomainHubData {
  return createDevPreviewBaseThread({
    branchId,
    hubLabel: "Career",
    existingGoals: [
      committedGoal(
        branchId,
        CAREER_EXISTING_GOAL_IDS.headOfProduct,
        "Become Head of Product",
        "ACTIVE",
      ),
      committedGoal(
        branchId,
        CAREER_EXISTING_GOAL_IDS.personalBrand,
        "Personal brand on LinkedIn",
        "ACTIVE",
      ),
      committedGoal(
        branchId,
        CAREER_EXISTING_GOAL_IDS.book,
        "Write a book on product leadership",
        "ACTIVE",
      ),
    ],
    existingMoments: [
      committedMark(branchId, "existing-mark-promoted", "Promoted to Senior Engineer", "2025-03-01"),
      committedMark(
        branchId,
        "existing-mark-hbs",
        "Completed Harvard Business School course",
        "2025-05-04",
      ),
    ],
  });
}

/** Map dev layout fixture rows into Stream extract shapes for hub preview merge. */
export function previewLayoutToApprovedItems(input: PreviewLayoutInput): ApprovedStreamItems {
  const marks: ExtractedMark[] = input.marks.map((m) => ({
    title: m.title,
    date: m.date ?? null,
    type: "achievement" as const,
  }));

  const pursuits: ExtractedPursuit[] = input.pursuits.map((p) => {
    const pursuit: ExtractedPursuit = {
      title: p.title,
      goalType: p.goalType ?? "project",
      bloomStatus: p.bloomStatus ?? "ACTIVE",
    };
    if (p.clientKey) pursuit.clientKey = p.clientKey;
    if (p.parentExistingGoalId) {
      pursuit.parentRef = { kind: "existing", goalId: p.parentExistingGoalId };
    } else if (p.parentQueueId) {
      const parent = input.pursuits.find((x) => x.queueId === p.parentQueueId);
      if (parent?.clientKey) {
        pursuit.parentRef = { kind: "new", clientKey: parent.clientKey };
      }
    }
    return pursuit;
  });

  const milestones: ExtractedMilestone[] = input.milestones.map((ms) => {
    const pursuit = input.pursuits.find((p) => p.queueId === ms.pursuitQueueId);
    if (pursuit?.clientKey) {
      return {
        title: ms.title,
        pursuitRef: { kind: "new", clientKey: pursuit.clientKey },
      };
    }
    return {
      title: ms.title,
      pursuitRef: { kind: "existing", goalId: CAREER_EXISTING_GOAL_IDS.headOfProduct },
    };
  });

  return { marks, pursuits, milestones };
}

export const streamPreviewFixtureCareerLayout = layoutStreamPreview(STREAM_PREVIEW_FIXTURE_CAREER);
export const streamPreviewFixtureRichLayout = streamPreviewFixtureCareerLayout;
export const streamPreviewFixtureMinimalLayout = layoutStreamPreview(STREAM_PREVIEW_FIXTURE_MINIMAL);
