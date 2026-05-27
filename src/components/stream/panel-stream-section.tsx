"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  STREAM_CARD_ANIMATION_CSS,
  STREAM_CARD_VARIANT_CSS,
  responsiveActionsCss,
} from "@/components/stream/confirmation/stream-confirmation-styles";
import { STREAM_COMPOSER_CSS, StreamComposer } from "@/components/stream/stream-composer";
import { StreamConfirmation } from "@/components/stream/stream-confirmation";
import {
  streamExtractCatchMessage,
  streamExtractUserMessage,
} from "@/lib/stream-extract-errors";
import type { StreamExtractResponse, StreamUiSession } from "@/types/stream";

type Phase = "input" | "extracting" | "confirm";

const EMPTY_STREAM_MESSAGE =
  "Got it — I'll remember that about you.";

function streamConfirmationCardCount(extraction: StreamExtractResponse): number {
  return (
    extraction.marks.length +
    extraction.pursuits.length +
    extraction.milestones.length +
    extraction.pursuitUpdates.length +
    extraction.milestoneUpdates.length +
    extraction.milestoneCompletions.length +
    extraction.milestoneDeletes.length +
    extraction.ambiguous.length
  );
}

function queueMemoryUpdateFromClient(sessionText: string): void {
  const text = sessionText.trim();
  if (!text) return;
  void fetch("/api/memory/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionText: text }),
  }).catch((err) => {
    console.warn("[PanelStreamSection] memory update failed", err);
  });
}

type PanelStreamSectionProps = {
  session: StreamUiSession;
  onClose: () => void;
  onCommitSuccess: () => void;
  onCommitFailed: (error: string) => void;
  onExtracted: () => void;
  onClearPreview: () => void;
  onCardFocusHub?: (areaId: string, branchId: string) => void;
  onOnboardingFirstCardConfirmed?: () => void;
  isOnboardingGuideActive?: boolean;
};

const PANEL_STREAM_SECTION_CSS = `
@keyframes panelStreamIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes panelStreamOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-6px); }
}

.pf-panel-stream-section {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.025);
  animation: panelStreamIn 220ms ease-out both;
}

.pf-panel-stream-section.is-closing {
  animation: panelStreamOut 180ms ease-in both;
}

.pf-panel-stream-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.pf-panel-stream-kicker {
  margin: 0;
  font-family: var(--font-pf-tree-mono, ui-monospace, monospace);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.42);
}

.pf-panel-stream-close {
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.46);
  cursor: pointer;
  padding: 2px 4px;
  font-size: 16px;
  line-height: 1;
}

.pf-panel-stream-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: rgba(245, 243, 250, 0.5);
}

.pf-panel-stream-narrative {
  padding: 9px 11px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.035);
  color: rgba(255,255,255,0.68);
  font-size: 13px;
  line-height: 1.45;
}

.pf-panel-stream-narrative strong {
  display: block;
  margin-bottom: 4px;
  font-family: var(--font-pf-tree-mono, ui-monospace, monospace);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.42);
}

.pf-panel-stream-slow-hint {
  margin-top: 6px;
  color: rgba(255,255,255,0.48);
}

.pf-panel-stream-cards {
  max-height: 50vh;
  overflow-y: auto;
  min-height: 0;
}
`;

const ASSISTANT_MESSAGE_STYLE: CSSProperties = {
  margin: "10px 0 0",
  padding: "0 2px",
  fontSize: 13,
  lineHeight: 1.45,
  color: "var(--color-text-secondary)",
};

const RATE_LIMIT_RETRY_MS = 3_000;

function accentColor(session: StreamUiSession): string {
  return session.mode === "theme" ? session.theme.themeColor : session.hub.areaColor;
}

function sessionKey(session: StreamUiSession): string {
  return session.mode === "theme" ? session.theme.themeId : session.hub.branchId;
}

function composerPlaceholder(session: StreamUiSession): string {
  if (session.onboardingQuestion?.trim()) return session.onboardingQuestion.trim();
  if (session.initialPlaceholder?.trim()) return session.initialPlaceholder.trim();
  if (session.mode === "theme") return `What's been happening in ${session.theme.themeName}?`;
  return `What's been happening in ${session.hub.branchLabel}?`;
}

function isRateLimitFailure(status: number | null, message?: string | null): boolean {
  const m = message?.toLowerCase() ?? "";
  return status === 429 || m.includes("429") || m.includes("rate limit") || m.includes("quota");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function PanelStreamSection({
  session,
  onClose,
  onCommitSuccess,
  onCommitFailed,
  onExtracted,
  onClearPreview,
  onCardFocusHub,
  onOnboardingFirstCardConfirmed,
  isOnboardingGuideActive = false,
}: PanelStreamSectionProps) {
  const accent = accentColor(session);
  const onboardingMode = isOnboardingGuideActive || session.onboardingMode === true;
  const placeholder = composerPlaceholder(session);

  const [phase, setPhase] = useState<Phase>("input");
  const [voiceUsedInSession, setVoiceUsedInSession] = useState(false);
  const [draft, setDraft] = useState(session.initialDraft ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onboardingRetryReady, setOnboardingRetryReady] = useState(false);
  const [extraction, setExtraction] = useState<StreamExtractResponse | null>(null);
  const [narrative, setNarrative] = useState("");
  const [slowHintVisible, setSlowHintVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  const inputMode = voiceUsedInSession ? "voice" : "text";
  const extracting = phase === "extracting";
  const composerDisabled = busy || extracting || closing;

  useEffect(() => {
    setDraft(session.initialDraft ?? "");
    setVoiceUsedInSession(false);
    setPhase("input");
    setExtraction(null);
    setNarrative("");
    setError(null);
    setNotice(null);
    setOnboardingRetryReady(false);
  }, [sessionKey(session), session.initialDraft]);

  useEffect(() => {
    if (!extracting) {
      setSlowHintVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setSlowHintVisible(true), 2500);
    return () => window.clearTimeout(timer);
  }, [extracting]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  }, [closing, onClose]);

  const handleExtract = useCallback(async () => {
    const text = draft.trim();
    if (!text) {
      setError(session.mode === "theme" ? "Say something about this theme first." : "Say something about this hub first.");
      return;
    }

    const body =
      session.mode === "theme"
        ? { themeId: session.theme.themeId, input: text, inputMode }
        : { hubId: session.hub.branchId, input: text, inputMode };

    setBusy(true);
    setError(null);
    setNotice(null);
    setOnboardingRetryReady(false);
    setNarrative("");
    setExtraction(null);
    setSlowHintVisible(false);
    setPhase("extracting");

    const extractOnce = async () => {
      const res = await fetch("/api/stream/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        return {
          ok: false as const,
          status: res.status,
          error: data?.error ?? null,
        };
      }
      return { ok: true as const, data: data as StreamExtractResponse };
    };

    try {
      let result = await extractOnce();

      if (!result.ok && isRateLimitFailure(result.status, result.error)) {
        setError("Just a moment — almost ready...");
        await delay(RATE_LIMIT_RETRY_MS);
        result = await extractOnce();
        if (!result.ok) {
          setError(onboardingMode ? "Something went wrong — tap to try again." : streamExtractUserMessage(result.status, result.error));
          if (onboardingMode) setOnboardingRetryReady(true);
          setPhase("input");
          return;
        }
      }

      if (!result.ok) {
        setError(onboardingMode ? "Something went wrong — tap to try again." : streamExtractUserMessage(result.status, result.error));
        if (onboardingMode) setOnboardingRetryReady(true);
        setPhase("input");
        return;
      }

      if (streamConfirmationCardCount(result.data) === 0) {
        queueMemoryUpdateFromClient(body.input);
        setNotice(EMPTY_STREAM_MESSAGE);
        setPhase("input");
        return;
      }

      setNarrative(result.data.narrativeSentence ?? "");
      setExtraction(result.data);
      setPhase("confirm");
    } catch (err) {
      if (isRateLimitFailure(null, err instanceof Error ? err.message : String(err))) {
        setError("Just a moment — almost ready...");
        await delay(RATE_LIMIT_RETRY_MS);
        try {
          const retryResult = await extractOnce();
          if (retryResult.ok) {
            if (streamConfirmationCardCount(retryResult.data) === 0) {
              queueMemoryUpdateFromClient(body.input);
              setNotice(EMPTY_STREAM_MESSAGE);
              setPhase("input");
              return;
            }
            setNarrative(retryResult.data.narrativeSentence ?? "");
            setExtraction(retryResult.data);
            setPhase("confirm");
            return;
          }
          setError(onboardingMode ? "Something went wrong — tap to try again." : streamExtractUserMessage(retryResult.status, retryResult.error));
          if (onboardingMode) setOnboardingRetryReady(true);
          setPhase("input");
          return;
        } catch (retryErr) {
          setError(onboardingMode ? "Something went wrong — tap to try again." : streamExtractCatchMessage(retryErr));
          if (onboardingMode) setOnboardingRetryReady(true);
          setPhase("input");
          return;
        }
      }

      setError(streamExtractCatchMessage(err));
      setPhase("input");
    } finally {
      setBusy(false);
    }
  }, [draft, inputMode, onboardingMode, session]);

  const handleStartOver = useCallback(() => {
    onClearPreview();
    setPhase("input");
    setExtraction(null);
    setNarrative("");
    setError(null);
    setNotice(null);
    setOnboardingRetryReady(false);
    setDraft(session.initialDraft ?? "");
    setVoiceUsedInSession(false);
  }, [onClearPreview, session.initialDraft]);

  const handleDone = useCallback(() => {
    // StreamConfirmation starts the background commit before invoking success/failure callbacks.
  }, []);

  const handleCommitSuccess = useCallback(() => {
    onCommitSuccess();
    requestClose();
  }, [onCommitSuccess, requestClose]);

  const handleCommitFailed = useCallback(
    (commitError: string) => {
      setError(commitError);
      onCommitFailed(commitError);
    },
    [onCommitFailed],
  );

  return (
    <section
      className={`pf-roadmap pf-stream-shell pf-panel-stream-section${closing ? " is-closing" : ""}`}
      style={{ ["--stream-accent" as string]: accent }}
    >
      <style dangerouslySetInnerHTML={{ __html: STREAM_CARD_ANIMATION_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: STREAM_CARD_VARIANT_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: responsiveActionsCss }} />
      <style dangerouslySetInnerHTML={{ __html: STREAM_COMPOSER_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: PANEL_STREAM_SECTION_CSS }} />

      <div className="pf-panel-stream-heading">
        <p className="pf-panel-stream-kicker">Stream</p>
        {!busy ? (
          <button type="button" className="pf-panel-stream-close" onClick={requestClose} aria-label="Close Stream">
            ×
          </button>
        ) : null}
      </div>

      {extracting ? (
        <div className="pf-panel-stream-narrative" aria-live="polite" aria-busy="true">
          <strong>Listening</strong>
          {narrative || "Making sense of this…"}
          {slowHintVisible ? (
            <div className="pf-panel-stream-slow-hint">
              Still working — complex inputs take a moment.
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "confirm" && extraction ? (
        <div className="pf-panel-stream-cards">
          {error ? (
            <p
              style={{
                ...ASSISTANT_MESSAGE_STYLE,
                margin: "0 0 10px",
                padding: "9px 11px",
                borderRadius: 10,
                background: "rgba(11, 10, 15, 0.64)",
              }}
            >
              {error}
            </p>
          ) : null}
          {session.mode === "theme" ? (
            <StreamConfirmation
              mode="theme"
              theme={session.theme}
              extraction={extraction}
              busy={busy}
              inputText={draft}
              inputMode={inputMode}
              onboardingMode={onboardingMode}
              onStartOver={handleStartOver}
              onClearPreview={onClearPreview}
              onDone={handleDone}
              onCardFocusHub={onCardFocusHub}
              onExtracted={onExtracted}
              onCommitSuccess={handleCommitSuccess}
              onCommitFailed={handleCommitFailed}
              onOnboardingFirstCardConfirmed={onOnboardingFirstCardConfirmed}
            />
          ) : (
            <StreamConfirmation
              mode="hub"
              hub={session.hub}
              extraction={extraction}
              busy={busy}
              onboardingMode={onboardingMode}
              onStartOver={handleStartOver}
              onClearPreview={onClearPreview}
              onDone={handleDone}
              onCardFocusHub={onCardFocusHub}
              onExtracted={onExtracted}
              onCommitSuccess={handleCommitSuccess}
              onCommitFailed={handleCommitFailed}
              onOnboardingFirstCardConfirmed={onOnboardingFirstCardConfirmed}
            />
          )}
        </div>
      ) : null}

      {onboardingMode ? <p className="pf-panel-stream-hint">Take your time. Sentences are fine.</p> : null}
      <div data-onboarding-coach="stream-composer">
        <StreamComposer
          value={draft}
          onChange={setDraft}
          placeholder={placeholder}
          disabled={composerDisabled}
          busy={busy}
          accent={accent}
          proposalCount={extraction ? extraction.pursuits.length + extraction.milestones.length + extraction.marks.length : 0}
          onSend={() => void handleExtract()}
          onVoiceUsed={() => setVoiceUsedInSession(true)}
          voiceOptions={{ enabled: true }}
          showFooterHints={false}
          sendLabel="Send"
        />
      </div>

      {error && phase !== "confirm" ? (
        <div>
          <p style={ASSISTANT_MESSAGE_STYLE}>{error}</p>
          {onboardingMode && onboardingRetryReady ? (
            <button
              type="button"
              onClick={() => void handleExtract()}
              style={{
                marginTop: 8,
                border: `1px solid ${accent}66`,
                borderRadius: 999,
                background: `${accent}1f`,
                color: "rgba(245,243,250,0.9)",
                fontSize: 13,
                fontWeight: 600,
                padding: "7px 12px",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {notice && phase !== "confirm" && !error ? (
        <p style={ASSISTANT_MESSAGE_STYLE}>{notice}</p>
      ) : null}
    </section>
  );
}
