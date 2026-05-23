"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hubUiForSlug } from "@/lib/stream-theme-ui";
import { ONBOARDING_STREAM_TO_HORIZON_MS } from "@/components/onboarding/onboarding-scene-motion";
import {
  PREVIEW_PENDING_NODE_ID,
  useStreamPreview,
} from "@/contexts/stream-preview-context";
import type {
  StreamAmbiguousResolution,
  StreamExtractResponse,
  StreamHubUiContext,
  StreamThemeUiContext,
} from "@/types/stream";
import { StreamConfirmationCard } from "./confirmation/stream-confirmation-card";
import { StreamConfirmationProgress } from "./confirmation/stream-confirmation-progress";
import { previewNodeFromDecision } from "./confirmation/stream-confirmation-preview";
import { StreamConfirmationSummary } from "./confirmation/stream-confirmation-summary";
import { linkBtnStyle } from "./confirmation/stream-confirmation-styles";
import {
  type ConfirmationQueueItem,
  type MarkEdit,
  type MilestoneEdit,
  type PursuitEdit,
  type QueueEdits,
  type StreamSingleCommitPayload,
  type StreamDecision,
  buildPursuitTitleByRef,
  buildPursuitTitleByRefForTheme,
  buildQueue,
  buildSingleCommitPayload,
  countDecisions,
  countStreamCommitItems,
  mergeQueueItem,
  postStreamCommit,
  postStreamThemeCommit,
} from "./confirmation/stream-confirmation-types";

type StreamConfirmationBaseProps = {
  extraction: StreamExtractResponse;
  busy?: boolean;
  onboardingMode?: boolean;
  onStartOver: () => void;
  onClearPreview?: () => void;
  onDone: () => void;
  onCardFocusHub?: (areaId: string, branchId: string) => void;
  onExtracted?: () => void;
  inputText?: string;
  inputMode?: "text" | "voice";
  onOnboardingCommitSuccess?: () => void;
  onCommitSuccess?: () => void;
  onCommitFailed?: (error: string) => void;
  onOnboardingFirstCardConfirmed?: () => void;
};

export type StreamConfirmationProps = StreamConfirmationBaseProps &
  ({ mode: "hub"; hub: StreamHubUiContext } | { mode: "theme"; theme: StreamThemeUiContext });

type Phase = "cards" | "summary";

function decisionFromQueueItem(
  item: ConfirmationQueueItem,
  resolution?: StreamAmbiguousResolution,
): StreamDecision | null {
  if (item.kind === "ambiguous") {
    if (!resolution) return null;
    return {
      queueId: item.id,
      kind: "ambiguous",
      action: "resolve",
      item: item.item,
      resolution,
    };
  }
  if (item.kind === "mark") {
    return { queueId: item.id, kind: "mark", action: "add", item: item.item };
  }
  if (item.kind === "pursuit") {
    return { queueId: item.id, kind: "pursuit", action: "add", item: item.item };
  }
  return { queueId: item.id, kind: "milestone", action: "add", item: item.item };
}

export function StreamConfirmation(props: StreamConfirmationProps) {
  const {
    extraction,
    busy = false,
    onboardingMode = false,
    onStartOver,
    onClearPreview,
    onDone,
    onCardFocusHub,
    onExtracted,
    onOnboardingCommitSuccess,
    onCommitSuccess,
    onCommitFailed,
    onOnboardingFirstCardConfirmed,
  } = props;
  const isTheme = props.mode === "theme";
  const theme = isTheme ? props.theme : null;
  const hub = !isTheme ? props.hub : null;
  const accent = isTheme ? props.theme.themeColor : props.hub.areaColor;

  const { addPreviewNode, setPendingPreviewNode } = useStreamPreview();
  const queue = useMemo(() => {
    const titleByRef = isTheme
      ? buildPursuitTitleByRefForTheme(theme!, extraction.pursuits)
      : buildPursuitTitleByRef(hub!, extraction.pursuits);
    return buildQueue(extraction, titleByRef);
  }, [
    extraction,
    isTheme,
    theme?.themeId,
    theme?.hubs,
    hub?.branchId,
    hub?.areaId,
    hub?.existingGoals,
  ]);
  const pursuitTitleByRef = useMemo(
    () =>
      isTheme
        ? buildPursuitTitleByRefForTheme(theme!, extraction.pursuits)
        : buildPursuitTitleByRef(hub!, extraction.pursuits),
    [
      extraction,
      isTheme,
      theme?.themeId,
      theme?.hubs,
      hub?.branchId,
      hub?.areaId,
      hub?.existingGoals,
    ],
  );

  const [phase, setPhase] = useState<Phase>(() => (queue.length === 0 ? "summary" : "cards"));
  const [cardIndex, setCardIndex] = useState(0);
  const [decisions, setDecisions] = useState<StreamDecision[]>([]);
  const [edits, setEdits] = useState<QueueEdits>({});
  const [skippedClientKeys, setSkippedClientKeys] = useState<Set<string>>(() => new Set());
  const [batchCommitInFlight, setBatchCommitInFlight] = useState(false);
  const [batchCommitError, setBatchCommitError] = useState<string | null>(null);
  const [onboardingFirstSaved, setOnboardingFirstSaved] = useState(false);
  const [onboardingCelebration, setOnboardingCelebration] = useState(false);
  const onboardingAdvanceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (onboardingAdvanceTimerRef.current != null) {
        window.clearTimeout(onboardingAdvanceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setPhase(queue.length === 0 ? "summary" : "cards");
    setCardIndex(0);
    setDecisions([]);
    setEdits({});
    setSkippedClientKeys(new Set());
    setBatchCommitError(null);
    setPendingPreviewNode(null);
  }, [extraction, queue.length, setPendingPreviewNode]);

  useEffect(() => {
    if ((extraction.committedAmbiguousCount ?? 0) > 0) {
      onExtracted?.();
    }
  }, [extraction]);

  const currentItem = queue[cardIndex] ?? null;
  const currentItemId = currentItem?.id ?? null;
  const currentItemKind = currentItem?.kind;
  const currentEdit = currentItemId ? edits[currentItemId] : undefined;

  const patchEdit = useCallback((queueId: string, patch: MarkEdit | PursuitEdit | MilestoneEdit) => {
    setEdits((prev) => ({
      ...prev,
      [queueId]: { ...(prev[queueId] ?? {}), ...patch },
    }));
  }, []);

  const patchHubRoute = useCallback(
    (queueId: string, hubSlug: string) => {
      patchEdit(queueId, { hubId: hubSlug });
    },
    [patchEdit],
  );

  const registerSkippedPursuitKey = useCallback((item: ConfirmationQueueItem) => {
    if (item.kind === "pursuit" && item.item.clientKey && !item.item.existingGoalId) {
      setSkippedClientKeys((prev) => new Set(prev).add(item.item.clientKey!));
    }
  }, []);

  const advance = useCallback(
    (decision: StreamDecision) => {
      setDecisions((prev) => [...prev, decision]);
      setBatchCommitError(null);
      const next = cardIndex + 1;
      if (next >= queue.length) {
        setPhase("summary");
      } else {
        setCardIndex(next);
      }
    },
    [cardIndex, queue.length],
  );

  const themeCtx = isTheme ? props.theme : null;
  const hubCtx = !isTheme ? props.hub : null;

  const resolvePreviewRouting = useCallback(
    (item: { hubId?: string }) => {
      if (themeCtx) {
        const hub = hubUiForSlug(themeCtx, item.hubId);
        const fallback = themeCtx.hubs[0];
        return {
          areaId: themeCtx.themeId,
          branchId: hub?.branchId ?? fallback?.branchId ?? "",
        };
      }
      if (hubCtx) {
        return { areaId: hubCtx.areaId, branchId: hubCtx.branchId };
      }
      return { areaId: "", branchId: "" };
    },
    [themeCtx, hubCtx],
  );

  const recordPreviewForDecision = useCallback(
    (decision: StreamDecision) => {
      if (decision.action === "skip" || decision.kind === "ambiguous") return;
      const routing = resolvePreviewRouting(decision.item);
      const node = previewNodeFromDecision(decision, routing);
      if (node) addPreviewNode(node);
    },
    [addPreviewNode, resolvePreviewRouting],
  );

  const handleAdd = useCallback(async () => {
    if (!currentItem || currentItem.kind === "ambiguous") return;
    const working = mergeQueueItem(currentItem, edits);
    const decision = decisionFromQueueItem(working);
    if (!decision) return;

    if (onboardingMode && !onboardingFirstSaved && hub) {
      setBatchCommitInFlight(true);
      setBatchCommitError(null);
      const payload = buildSingleCommitPayload(decision, skippedClientKeys, new Map());
      const result = await postStreamCommit(hub.branchId, payload);
      setBatchCommitInFlight(false);
      if (!result.ok) {
        setBatchCommitError(result.error);
        return;
      }
      setOnboardingFirstSaved(true);
      setOnboardingCelebration(true);
      onClearPreview?.();
      onOnboardingCommitSuccess?.();
      if (onboardingAdvanceTimerRef.current != null) {
        window.clearTimeout(onboardingAdvanceTimerRef.current);
      }
      onboardingAdvanceTimerRef.current = window.setTimeout(() => {
        onboardingAdvanceTimerRef.current = null;
        onOnboardingFirstCardConfirmed?.();
      }, ONBOARDING_STREAM_TO_HORIZON_MS);
      return;
    }

    recordPreviewForDecision(decision);
    advance(decision);
  }, [
    advance,
    currentItem,
    edits,
    hub,
    onClearPreview,
    onOnboardingCommitSuccess,
    onOnboardingFirstCardConfirmed,
    onboardingFirstSaved,
    onboardingMode,
    recordPreviewForDecision,
    skippedClientKeys,
  ]);

  const handleSkip = useCallback(() => {
    if (!currentItem) return;
    registerSkippedPursuitKey(currentItem);
    setBatchCommitError(null);
    advance({ queueId: currentItem.id, kind: currentItem.kind, action: "skip" });
  }, [advance, currentItem, registerSkippedPursuitKey]);

  const handleResolve = useCallback(
    (resolution: StreamAmbiguousResolution) => {
      if (!currentItem || currentItem.kind !== "ambiguous") return;
      const decision = decisionFromQueueItem(currentItem, resolution);
      if (!decision) return;
      advance(decision);
    },
    [advance, currentItem],
  );

  const handleAddToTree = useCallback(async () => {
    setBatchCommitError(null);
    const committedClientKeyToGoalId = new Map<string, string>();
    const payload = decisions.reduce<StreamSingleCommitPayload>(
      (acc, decision) => {
        const next = buildSingleCommitPayload(
          decision,
          skippedClientKeys,
          committedClientKeyToGoalId,
        );
        acc.marks.push(...next.marks);
        acc.pursuits.push(...next.pursuits);
        acc.milestones.push(...next.milestones);
        acc.resolvedAmbiguous.push(...next.resolvedAmbiguous);
        return acc;
      },
      { marks: [], pursuits: [], milestones: [], resolvedAmbiguous: [] },
    );
    if (isTheme) {
      const inputText = props.inputText?.trim().slice(0, 4000) ?? "";
      if (!inputText) {
        setBatchCommitError("Session text missing — start over and extract again.");
        return;
      }
    }

    onDone();

    void (async () => {
      const result = isTheme
        ? await postStreamThemeCommit(props.theme.themeId, {
            ...payload,
            inputText: props.inputText!.trim().slice(0, 4000),
            inputMode: props.inputMode ?? "text",
            ...countStreamCommitItems(decisions),
          })
        : await postStreamCommit(props.hub.branchId, payload);
      if (!result.ok) {
        onCommitFailed?.(result.error);
        return;
      }
      onCommitSuccess?.();
    })();
  }, [
    decisions,
    isTheme,
    onCommitFailed,
    onCommitSuccess,
    onDone,
    props,
    skippedClientKeys,
  ]);

  const { added, skipped } = countDecisions(decisions);

  const hubSlugForItem = (item: ConfirmationQueueItem): string | undefined => {
    if (item.kind === "ambiguous") return undefined;
    const merged = mergeQueueItem(item, edits);
    if (merged.kind === "ambiguous") return undefined;
    return merged.item.hubId;
  };

  const focusHubForItem = useCallback(
    (item: ConfirmationQueueItem | null) => {
      if (!item || !onCardFocusHub || item.kind === "ambiguous") return;
      const merged = mergeQueueItem(item, edits);
      if (merged.kind === "ambiguous") return;
      const routing = resolvePreviewRouting(merged.item);
      if (routing.branchId) onCardFocusHub(routing.areaId, routing.branchId);
    },
    [edits, onCardFocusHub, resolvePreviewRouting],
  );

  useEffect(() => {
    if (phase !== "cards") return;
    focusHubForItem(currentItem);
  }, [phase, cardIndex, currentItem, focusHubForItem]);

  useEffect(() => {
    if (phase !== "cards" || !currentItemId) {
      setPendingPreviewNode(null);
      return;
    }
    const item = queue[cardIndex];
    if (!item || item.id !== currentItemId || item.kind === "ambiguous") {
      setPendingPreviewNode(null);
      return;
    }
    const working = mergeQueueItem(item, edits);
    const decision = decisionFromQueueItem(working);
    if (!decision || decision.action === "skip" || decision.kind === "ambiguous") {
      setPendingPreviewNode(null);
      return;
    }
    const routing = resolvePreviewRouting(decision.item);
    const node = previewNodeFromDecision(decision, routing);
    setPendingPreviewNode(node ? { ...node, id: PREVIEW_PENDING_NODE_ID } : null);
  }, [
    phase,
    cardIndex,
    currentItemId,
    currentItemKind,
    currentEdit,
    queue,
    resolvePreviewRouting,
    setPendingPreviewNode,
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flexShrink: 0, padding: "16px 0 0" }}>
        {extraction.clarifyingQuestion ? (
          <div
            style={{
              margin: "0 22px 12px",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(123, 104, 200, 0.35)",
              background: "rgba(123, 104, 200, 0.08)",
              fontSize: 14,
              lineHeight: 1.5,
              color: "var(--color-text-secondary)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                display: "block",
                marginBottom: 6,
                color: "var(--color-text-tertiary)",
              }}
            >
              Optional reflection
            </span>
            {extraction.clarifyingQuestion}
          </div>
        ) : null}

        {(extraction.committedAmbiguousCount ?? 0) > 0 || extraction.ambiguous.length > 0 ? (
          <div
            style={{
              margin: "0 22px 12px",
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${accent}44`,
              background: `${accent}12`,
              fontSize: 14,
              lineHeight: 1.5,
              color: "var(--color-text-secondary)",
            }}
          >
            {(extraction.committedAmbiguousCount ?? extraction.ambiguous.length) === 1
              ? "1 item on your map needs your input — tap the dimmed mark on the tree."
              : `${extraction.committedAmbiguousCount ?? extraction.ambiguous.length} items on your map need your input — tap each dimmed mark on the tree.`}
          </div>
        ) : null}

        {onboardingMode && phase === "cards" && cardIndex === 0 ? (
          <div style={{ margin: "0 22px 12px" }}>
            <h3
              style={{
                margin: "0 0 6px",
                fontSize: 17,
                fontWeight: 600,
                color: "var(--color-text-primary)",
              }}
            >
              Here&apos;s what I heard.
            </h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
              Pathfinder turns what you say into your map. Tell me if I got this right.
            </p>
          </div>
        ) : null}

        {onboardingCelebration ? (
          <p
            style={{
              margin: "0 22px 12px",
              fontSize: 14,
              fontWeight: 600,
              color: accent,
            }}
          >
            That&apos;s your first pursuit.
          </p>
        ) : null}

        {!onboardingMode && phase === "cards" && queue.length > 0 ? (
          <StreamConfirmationProgress current={cardIndex + 1} total={queue.length} />
        ) : null}

        {!onboardingMode ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 22px 8px" }}>
            <button type="button" onClick={onStartOver} disabled={busy || batchCommitInFlight} style={linkBtnStyle}>
              Start over
            </button>
          </div>
        ) : null}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px 22px 24px",
        }}
      >
        {phase === "cards" && currentItem ? (
          <StreamConfirmationCard
            key={currentItem.id}
            queueItem={currentItem}
            edits={edits}
            accent={accent}
            pursuitTitleByRef={pursuitTitleByRef}
            sessionPursuits={extraction.pursuits}
            theme={isTheme && !onboardingMode ? props.theme : undefined}
            hubSlug={hubSlugForItem(currentItem)}
            onHubRouteChange={
              isTheme && !onboardingMode ? (slug) => patchHubRoute(currentItem.id, slug) : undefined
            }
            onEdit={patchEdit}
            onAdd={() => void handleAdd()}
            onSkip={handleSkip}
            onResolve={handleResolve}
            commitInFlight={batchCommitInFlight}
            commitError={batchCommitError}
            onRetry={() => void handleAdd()}
            confirmLabel={onboardingMode && cardIndex === 0 ? "Yes, that's right" : "Confirm"}
          />
        ) : (
          <StreamConfirmationSummary
            added={added}
            skipped={skipped}
            accent={accent}
            commitInFlight={batchCommitInFlight}
            commitError={batchCommitError}
            onAddToTree={() => void handleAddToTree()}
            onStartOver={onStartOver}
          />
        )}
      </div>
    </div>
  );
}
