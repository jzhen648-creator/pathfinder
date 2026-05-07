/**
 * SCREEN — Timeline
 *
 * This is the standalone timeline screen wrapper.
 * The map currently renders timeline mode inside the main life map screen.
 *
 * EDIT THIS FILE WHEN:
 * - You want a dedicated timeline-only page.
 * - You want to pass timeline-specific data and handlers.
 *
 * AFFECTS:
 * - Any route or screen that should show a timeline-only experience.
 */

import { TimelineView, type TimelineNode } from "@/components/life-map/TimelineView";

type TimelineScreenProps = {
  nodes: TimelineNode[];
  branchMetaByLabel: Record<string, { label: string; icon: string; color: string }>;
  onStartBranch: (branchLabel: string) => void;
};

export default function TimelineScreen({
  nodes,
  branchMetaByLabel,
  onStartBranch,
}: TimelineScreenProps) {
  return (
    <TimelineView
      nodes={nodes}
      branchMetaByLabel={branchMetaByLabel}
      onStartBranch={onStartBranch}
    />
  );
}

