"use client";

import { useEffect, useState } from "react";
import { PF_NATIVE_SELECT_CLASS } from "@/lib/ui/native-select-style";
import { GOAL_TYPE_VALUES } from "@/lib/validation/create-goal";
import type { CreateGoalGoalType } from "@/lib/validation/create-goal";
import { StreamHubRoutePill } from "@/components/stream/confirmation/stream-hub-route-pill";
import type { ExtractedPursuit, StreamThemeUiContext } from "@/types/stream";
import { formatBloomStatusLabel } from "@/lib/bloom-display";
import { STREAM_BLOOM_VALUES } from "@/types/stream";
import type { StreamAmbiguousResolution } from "@/types/stream";
import {
  type ConfirmationQueueItem,
  type MarkEdit,
  type MilestoneEdit,
  type PursuitEdit,
  type QueueEdits,
  formatMarkDisplayDate,
  formatPursuitPeerDetail,
  kindLabel,
  mergeQueueItem,
  formatPursuitDeadlineDisplay,
  hasPursuitReview,
  normalizeDateYmd,
  normalizeDeadlineYmd,
  pursuitParentLabel,
} from "./stream-confirmation-types";
import {
  type StreamCardVariant,
  actionsColumnStyle,
  cardHeaderStyle,
  editIconBtnStyle,
  ghostBtn,
  inputStyle,
  primaryBtn,
  selectStyle,
  streamCardVariant,
} from "./stream-confirmation-styles";

type Props = {
  queueItem: ConfirmationQueueItem;
  edits: QueueEdits;
  accent: string;
  pursuitTitleByRef: Map<string, string>;
  sessionPursuits: ExtractedPursuit[];
  theme?: StreamThemeUiContext;
  hubSlug?: string;
  onHubRouteChange?: (hubSlug: string) => void;
  onEdit: (queueId: string, patch: MarkEdit | PursuitEdit | MilestoneEdit) => void;
  onAdd: () => void;
  onSkip: () => void;
  onResolve: (resolution: StreamAmbiguousResolution) => void;
  commitInFlight?: boolean;
  commitError?: string | null;
  onRetry?: () => void;
  confirmLabel?: string;
};

function StreamCardConnector({ strength }: { strength: "pursuit" | "milestone" }) {
  const opacity = strength === "pursuit" ? 0.35 : 0.2;
  return (
    <svg className="pf-stream-card-connector" viewBox="0 0 24 28" aria-hidden>
      <path
        d="M 10 0 L 10 18 Q 10 24 16 24 L 24 24"
        fill="none"
        stroke="var(--stream-accent, var(--color-border-tertiary))"
        strokeOpacity={opacity}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StreamConfirmationCard({
  queueItem,
  edits,
  accent,
  pursuitTitleByRef,
  sessionPursuits,
  theme,
  hubSlug,
  onHubRouteChange,
  onEdit,
  onAdd,
  onSkip,
  onResolve,
  commitInFlight = false,
  commitError = null,
  onRetry,
  confirmLabel = "Confirm",
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const working = mergeQueueItem(queueItem, edits);
  const variant = streamCardVariant(working);

  useEffect(() => {
    setEditOpen(false);
  }, [queueItem.id]);

  const card = (
    <article className={`pf-stream-card pf-stream-card--${variant}`} key={queueItem.id}>
      <header style={cardHeaderStyle}>
        <span className="pf-stream-card-label">{kindLabel(working.kind)}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          {theme && hubSlug && working.kind !== "ambiguous" && onHubRouteChange ? (
            <StreamHubRoutePill
              theme={theme}
              hubSlug={hubSlug}
              onHubChange={onHubRouteChange}
              disabled={commitInFlight}
            />
          ) : null}
          {working.kind !== "ambiguous" ? (
          <button
            type="button"
            aria-label="Edit title"
            aria-expanded={editOpen}
            onClick={() => setEditOpen((o) => !o)}
            style={editIconBtnStyle}
          >
            ✎
          </button>
          ) : null}
        </div>
      </header>

      {working.kind === "ambiguous" ? (
        <AmbiguousBody item={working.item} accent={accent} onResolve={onResolve} />
      ) : (
        <StandardBody
          working={working}
          variant={variant}
          editOpen={editOpen}
          accent={accent}
          pursuitTitleByRef={pursuitTitleByRef}
          sessionPursuits={sessionPursuits}
          onEdit={onEdit}
          onAdd={onAdd}
          onSkip={onSkip}
          commitInFlight={commitInFlight}
          commitError={commitError}
          onRetry={onRetry}
          confirmLabel={confirmLabel}
        />
      )}
    </article>
  );

  if (variant === "pursuit-child") {
    return (
      <div className="pf-stream-card-wrap pf-stream-card-wrap--child">
        <StreamCardConnector strength="pursuit" />
        {card}
      </div>
    );
  }

  if (variant === "milestone") {
    return (
      <div className="pf-stream-card-wrap pf-stream-card-wrap--milestone">
        <StreamCardConnector strength="milestone" />
        {card}
      </div>
    );
  }

  return card;
}

function StandardBody({
  working,
  variant,
  editOpen,
  accent,
  pursuitTitleByRef,
  sessionPursuits,
  onEdit,
  onAdd,
  onSkip,
  commitInFlight,
  commitError,
  onRetry,
  confirmLabel,
}: {
  working: Exclude<ConfirmationQueueItem, { kind: "ambiguous" }>;
  variant: StreamCardVariant;
  editOpen: boolean;
  accent: string;
  pursuitTitleByRef: Map<string, string>;
  sessionPursuits: ExtractedPursuit[];
  onEdit: Props["onEdit"];
  onAdd: () => void;
  onSkip: () => void;
  commitInFlight: boolean;
  commitError: string | null;
  onRetry?: () => void;
  confirmLabel: string;
}) {
  return (
    <>
      {!editOpen ? (
        <CardReadOnlyBody
          working={working}
          variant={variant}
          pursuitTitleByRef={pursuitTitleByRef}
          sessionPursuits={sessionPursuits}
        />
      ) : (
        <EditPanel working={working} onEdit={onEdit} />
      )}

      {working.kind === "pursuit" ? (
        <PursuitDeadlineEditor
          queueId={working.id}
          deadline={working.item.deadline}
          onEdit={onEdit}
        />
      ) : null}

      {working.kind === "pursuit" && hasPursuitReview(working.item) ? (
        <PursuitReviewPanel
          queueId={working.id}
          pursuit={working.item}
          accent={accent}
          onEdit={onEdit}
        />
      ) : null}

      {commitError ? (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: "0 0 10px", fontSize: 14, color: "#b91c1c" }}>{commitError}</p>
          <div
            className="pf-stream-confirm-actions"
            style={{ ...actionsColumnStyle, flexDirection: "row", gap: 10 }}
          >
            <button
              type="button"
              onClick={onRetry}
              disabled={commitInFlight}
              style={{
                ...primaryBtn(accent),
                flex: 1,
                opacity: commitInFlight ? 0.65 : 1,
              }}
            >
              {commitInFlight ? "Saving…" : "Retry"}
            </button>
            <button type="button" onClick={onSkip} disabled={commitInFlight} style={{ ...ghostBtn(), flex: 1 }}>
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div className="pf-stream-confirm-actions" style={{ ...actionsColumnStyle, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={onAdd}
            disabled={commitInFlight}
            style={{
              ...primaryBtn(accent),
              opacity: commitInFlight ? 0.65 : 1,
              cursor: commitInFlight ? "wait" : "pointer",
            }}
          >
            {commitInFlight ? "Saving…" : confirmLabel}
          </button>
          <button type="button" onClick={onSkip} disabled={commitInFlight} style={ghostBtn()}>
            Skip
          </button>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-pf-roadmap-mono), ui-monospace, monospace",
              fontSize: 10.5,
              color: "rgba(255,255,255,0.32)",
              letterSpacing: "0.06em",
            }}
          >
            ⌘↵
          </span>
        </div>
      )}
    </>
  );
}

function CardReadOnlyBody({
  working,
  variant,
  pursuitTitleByRef,
  sessionPursuits,
}: {
  working: Exclude<ConfirmationQueueItem, { kind: "ambiguous" }>;
  variant: StreamCardVariant;
  pursuitTitleByRef: Map<string, string>;
  sessionPursuits: ExtractedPursuit[];
}) {
  if (working.kind === "mark") {
    return (
      <>
        <h3 className="pf-stream-card-title">{working.item.title}</h3>
        <p className="pf-stream-card-date">{formatMarkDisplayDate(working.item.date)}</p>
      </>
    );
  }

  if (working.kind === "milestone") {
    return (
      <>
        <h3 className="pf-stream-card-title">{working.item.title}</h3>
        <p className="pf-stream-card-parent">on: {working.pursuitLabel}</p>
      </>
    );
  }

  const parentTitle =
    variant === "pursuit-child"
      ? pursuitParentLabel(working.item, pursuitTitleByRef, sessionPursuits)
      : null;

  return (
    <>
      <h3 className="pf-stream-card-title">{working.item.title}</h3>
      {parentTitle ? <p className="pf-stream-card-parent">↳ {parentTitle}</p> : null}
      {working.item.description?.trim() ? (
        <p className="pf-stream-card-detail" style={{ lineHeight: 1.45 }}>
          {working.item.description.trim()}
        </p>
      ) : null}
      <p className="pf-stream-card-detail">{formatPursuitPeerDetail(working.item)}</p>
    </>
  );
}

function PursuitReviewPanel({
  queueId,
  pursuit,
  accent,
  onEdit,
}: {
  queueId: string;
  pursuit: ExtractedPursuit;
  accent: string;
  onEdit: Props["onEdit"];
}) {
  const suggested = pursuit.suggestedTitle?.trim();
  const showSuggestion =
    Boolean(suggested) && suggested!.toLowerCase() !== pursuit.title.trim().toLowerCase();

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
        border: `1px solid ${accent}33`,
        backgroundColor: `${accent}0d`,
        display: "grid",
        gap: 8,
      }}
    >
      {pursuit.sourcePhrase?.trim() ? (
        <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
          You wrote: “{pursuit.sourcePhrase.trim()}”
        </p>
      ) : null}
      {pursuit.reviewNote?.trim() ? (
        <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.88)", lineHeight: 1.45 }}>
          {pursuit.reviewNote.trim()}
        </p>
      ) : null}
      {pursuit.eventContext?.trim() ? (
        <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.45 }}>
          {pursuit.eventContext.trim()}
        </p>
      ) : null}
      {showSuggestion ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
            Suggested: <strong style={{ color: "#fff" }}>{suggested}</strong>
          </span>
          <button
            type="button"
            onClick={() => onEdit(queueId, { title: suggested! })}
            style={{
              ...primaryBtn(accent),
              padding: "6px 12px",
              fontSize: 13,
            }}
          >
            Use suggestion
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PursuitDeadlineEditor({
  queueId,
  deadline,
  onEdit,
}: {
  queueId: string;
  deadline: string | null | undefined;
  onEdit: Props["onEdit"];
}) {
  const ymd = normalizeDeadlineYmd(deadline ?? null);
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
      <label
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.45)",
        }}
      >
        Deadline
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="date"
          value={ymd ?? ""}
          onChange={(e) =>
            onEdit(queueId, {
              deadline: e.target.value ? e.target.value : ymd,
            })
          }
          style={{ ...inputStyle, flex: 1, minWidth: 160 }}
        />
      </div>
      <p className="pf-stream-card-date" style={{ margin: 0 }}>
        {formatPursuitDeadlineDisplay(deadline)}
      </p>
    </div>
  );
}

function EditPanel({
  working,
  onEdit,
}: {
  working: Exclude<ConfirmationQueueItem, { kind: "ambiguous" }>;
  onEdit: Props["onEdit"];
}) {
  const id = working.id;

  if (working.kind === "mark") {
    return (
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <input
          value={working.item.title}
          onChange={(e) => onEdit(id, { title: e.target.value })}
          style={inputStyle}
          autoFocus
        />
        <input
          type="date"
          value={normalizeDateYmd(working.item.date)}
          onChange={(e) => onEdit(id, { date: e.target.value })}
          style={inputStyle}
        />
      </div>
    );
  }

  if (working.kind === "pursuit") {
    const disabled = Boolean(working.item.existingGoalId);
    return (
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <input
          value={working.item.title}
          onChange={(e) => onEdit(id, { title: e.target.value })}
          style={inputStyle}
          disabled={disabled}
          autoFocus={!disabled}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            className={PF_NATIVE_SELECT_CLASS}
            value={working.item.goalType}
            onChange={(e) => onEdit(id, { goalType: e.target.value as CreateGoalGoalType })}
            style={selectStyle}
            disabled={disabled}
          >
            {GOAL_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className={PF_NATIVE_SELECT_CLASS}
            value={working.item.bloomStatus}
            onChange={(e) =>
              onEdit(id, { bloomStatus: e.target.value as typeof working.item.bloomStatus })
            }
            style={selectStyle}
          >
            {STREAM_BLOOM_VALUES.map((b) => (
              <option key={b} value={b}>
                {formatBloomStatusLabel(b)}
              </option>
            ))}
          </select>
        </div>
        {disabled ? (
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Bloom existing pursuit</span>
        ) : null}
        <textarea
          value={working.item.description ?? ""}
          onChange={(e) => onEdit(id, { description: e.target.value })}
          placeholder="What is this pursuit about?"
          style={{ ...inputStyle, minHeight: 86, resize: "vertical", lineHeight: 1.45 }}
        />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <input
        value={working.item.title}
        onChange={(e) => onEdit(id, { title: e.target.value })}
        style={inputStyle}
        autoFocus
      />
    </div>
  );
}

function AmbiguousBody({
  item,
  accent,
  onResolve,
}: {
  item: { label: string; reason?: string | null };
  accent: string;
  onResolve: (resolution: StreamAmbiguousResolution) => void;
}) {
  return (
    <>
      <h3
        style={{
          margin: "12px 0 6px",
          fontSize: 20,
          fontWeight: 600,
          lineHeight: 1.35,
          color: "var(--color-text-primary)",
        }}
      >
        {item.label}
      </h3>
      {item.reason ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)", lineHeight: 1.45 }}>
          {item.reason}
        </p>
      ) : null}
      <div
        className="pf-stream-confirm-actions"
        style={{ ...actionsColumnStyle, flexDirection: "row", flexWrap: "wrap" }}
      >
        {(
          [
            ["done", "Done"],
            ["in_progress", "In progress"],
            ["not_started", "Not started"],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => onResolve(val)}
            style={{
              flex: "1 1 120px",
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              border: `1px solid var(--color-border-tertiary)`,
              background: "transparent",
              color: "var(--color-text-primary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = accent;
              e.currentTarget.style.background = `${accent}22`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-tertiary)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

