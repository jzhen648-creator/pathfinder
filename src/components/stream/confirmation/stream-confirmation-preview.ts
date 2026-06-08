import { PREVIEW_ID_PREFIX } from "@/components/stream/stream-hub-preview-data";
import type { PreviewNode } from "@/contexts/stream-preview-context";
import type { StreamDecision } from "./stream-confirmation-types";

export function previewNodeFromDecision(
  decision: StreamDecision,
  routing: { branchId: string; areaId: string },
): PreviewNode | null {
  if (decision.action === "skip" || decision.kind === "ambiguous") return null;

  const base = {
    hubId: routing.branchId,
    areaId: routing.areaId,
  };

  if (decision.kind === "mark") {
    return {
      id: `${PREVIEW_ID_PREFIX}mark-${decision.queueId}`,
      kind: "mark",
      title: decision.item.title,
      parentId: null,
      date: decision.item.date,
      ...base,
    };
  }

  if (decision.kind === "pursuit") {
    const clientKey = decision.item.clientKey ?? decision.queueId;
    return {
      id: `${PREVIEW_ID_PREFIX}pursuit-${clientKey}`,
      kind: "pursuit",
      title: decision.item.title,
      parentId: null,
      clientKey,
      bloomStatus: decision.item.bloomStatus,
      goalType: decision.item.goalType,
      ...base,
    };
  }

  const pursuitRef = decision.item.pursuitRef;
  const parentId =
    pursuitRef.kind === "existing"
      ? pursuitRef.goalId
      : `${PREVIEW_ID_PREFIX}pursuit-${pursuitRef.clientKey}`;

  return {
    id: `${PREVIEW_ID_PREFIX}ms-${decision.queueId}`,
    kind: "milestone",
    title: decision.item.title,
    parentId,
    pursuitClientId: parentId,
    ...base,
  };
}
