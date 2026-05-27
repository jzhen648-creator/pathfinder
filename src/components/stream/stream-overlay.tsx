"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

import { createPortal } from "react-dom";

import { StreamConfirmation } from "@/components/stream/stream-confirmation";

import {
  STREAM_COMPOSER_CSS,
  StreamComposer,
} from "@/components/stream/stream-composer";

import { PF_ROADMAP_THEME_CSS } from "@/components/shell/pf-roadmap-theme";

import {
  STREAM_CARD_ANIMATION_CSS,
  STREAM_CARD_VARIANT_CSS,
  responsiveActionsCss,
} from "@/components/stream/confirmation/stream-confirmation-styles";

import {
  streamExtractCatchMessage,
  streamExtractUserMessage,
} from "@/lib/stream-extract-errors";

import type {
  StreamExtractResponse,
  StreamHubUiContext,
  StreamThemeUiContext,
} from "@/types/stream";

const STREAM_ASSISTANT_MESSAGE_STYLE: CSSProperties = {
  margin: "12px 0 0",

  fontSize: 14,

  lineHeight: 1.5,

  color: "var(--color-text-secondary)",
};

type Phase = "input" | "extracting" | "confirm";

/** Stream is a map overlay now; keep exported width at 0 so the tree no longer pans for a side rail. */
export const STREAM_PANEL_WIDTH_PX = 0;

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
    console.warn("[StreamOverlay] memory update failed", err);
  });
}

const STREAM_PANEL_SLIDE_CSS = `

@keyframes streamOverlayFloatIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes streamOverlayCenteredFloatIn {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes streamDrawerSlideUp {
  from { opacity: 0; transform: translateY(100%); }
  to { opacity: 1; transform: translateY(0); }
}

.pf-stream-overlay-root.pf-stream-overlay-closing {
  animation: streamDrawerSlideUp 300ms ease-out reverse both;
}

.pf-stream-overlay-root {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  max-height: 45vh;
  height: auto;
  overflow: hidden;
  padding: 14px clamp(16px, 4vw, 32px) 16px;
  border-radius: 20px 20px 0 0;
  border-top: 1px solid rgba(255,255,255,0.08);
  background: rgba(7, 6, 10, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 -18px 54px rgba(0, 0, 0, 0.42);
  pointer-events: auto;
  color: var(--rm-text1, var(--color-text-primary));
  animation: streamDrawerSlideUp 300ms ease-out both;
}

.pf-stream-overlay-root > * {
  pointer-events: auto;
}

.pf-stream-drawer-inner {
  width: min(820px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(45vh - 30px);
  min-height: 0;
  overflow: hidden;
}

.pf-stream-back-btn {
  position: static;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 9px 5px 7px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.62);
  font-family: var(--font-pf-roadmap-sans), "Inter", system-ui, sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.pf-stream-state-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.45);
  font-family: var(--font-pf-roadmap-mono), "JetBrains Mono", monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.pf-stream-drawer-header {
  display: inline-flex;
  align-items: center;
  width: 100%;
  gap: 8px;
}

.pf-stream-state-badge::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--stream-accent, rgba(255, 255, 255, 0.55));
  box-shadow: 0 0 7px var(--stream-accent, rgba(255, 255, 255, 0.45));
}

.pf-stream-confirm-float {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  max-height: 35vh;
  overflow: hidden;
  animation: streamOverlayFloatIn 220ms ease-out both;
}

.pf-stream-confirm-float > div {
  max-height: 35vh;
  height: auto;
}

.pf-stream-composer-float {
  position: relative;
  left: auto;
  bottom: auto;
  z-index: 1;
  width: 100%;
  transform: none;
  animation: none;
}

.pf-stream-narrative-pill {
  position: relative;
  left: auto;
  bottom: auto;
  z-index: 1;
  width: 100%;
  transform: none;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.68);
  font-size: 13px;
  line-height: 1.45;
  box-shadow: none;
  animation: streamOverlayFloatIn 220ms ease-out both;
}

.pf-stream-narrative-pill strong {
  display: block;
  margin-bottom: 5px;
  color: rgba(255, 255, 255, 0.42);
  font-family: var(--font-pf-roadmap-mono), "JetBrains Mono", monospace;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.pf-stream-slow-extract-hint {
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 13px;
}

@media (max-width: 900px) {
  .pf-stream-confirm-float {
    width: auto;
  }

  .pf-stream-composer-float,
  .pf-stream-narrative-pill {
    width: 100%;
  }
}

@media (max-height: 680px) {
  .pf-stream-confirm-float {
    max-height: 32vh;
  }

  .pf-stream-confirm-float > div {
    max-height: 32vh;
  }
}

.pf-stream-onboarding-embed {
  position: relative;
  inset: auto;
  min-height: 0;
  pointer-events: auto;
  color: var(--rm-text1, var(--color-text-primary));
}

.pf-stream-onboarding-embed > * {
  pointer-events: auto;
}

.pf-stream-onboarding-hint {
  margin: 8px 0 4px;
  padding: 0 2px;
  font-size: 13px;
  line-height: 1.45;
  color: rgba(245, 243, 250, 0.5);
  font-family: var(--font-pf-roadmap-sans), "DM Sans", sans-serif;
}

.pf-stream-onboarding-hint-float {
  position: static;
  width: 100%;
  transform: none;
  text-align: left;
  pointer-events: auto;
}

.pf-stream-composer-onboarding {
  position: relative;
  width: 100%;
  transform: none;
  left: auto;
  bottom: auto;
  animation: none;
}

.pf-stream-confirm-onboarding {
  position: relative;
  top: auto;
  right: auto;
  width: 100%;
  height: auto;
  max-height: 35vh;
  min-height: 0;
  overflow: hidden;
  margin-top: 4px;
  animation: none;
}

.pf-stream-confirm-onboarding > div {
  height: auto;
  max-height: 35vh;
  min-height: 0;
}

`;

type StreamOverlayBaseProps = {
  initialDraft?: string;
  initialPlaceholder?: string;
  onboardingMode?: boolean;
  onboardingQuestion?: string;
  onClose: () => void;
  onCommitted: () => void;
  onClearPreview?: () => void;
  onCardFocusHub?: (areaId: string, branchId: string) => void;
  onExtracted?: () => void;
  /** Prefetch server tree data after the first onboarding card commits. */
  onOnboardingCommitSuccess?: () => void;
  /** After batch commit succeeds (main app). */
  onCommitSuccess?: () => void;
  /** When batch commit fails after Stream has closed. */
  onCommitFailed?: (error: string) => void;
  /** After the first confirmation card is saved during onboarding Stream. */
  onOnboardingFirstCardConfirmed?: () => void;
  embed?: boolean;
};

export type StreamOverlayProps = StreamOverlayBaseProps &
  (
    | { mode: "hub"; hub: StreamHubUiContext }
    | { mode: "theme"; theme: StreamThemeUiContext }
  );

// Reserved for future global Stream.
// Hub and theme Stream renders inline
// via PanelStreamSection in tree-panel.tsx.

function accentColor(props: StreamOverlayProps): string {
  return props.mode === "theme" ? props.theme.themeColor : props.hub.areaColor;
}

function sessionKey(props: StreamOverlayProps): string {
  return props.mode === "theme" ? props.theme.themeId : props.hub.branchId;
}

function composerPlaceholder(props: StreamOverlayProps): string {
  if (props.onboardingMode && props.onboardingQuestion?.trim()) {
    return props.onboardingQuestion.trim();
  }
  if (props.initialPlaceholder?.trim()) {
    return props.initialPlaceholder.trim();
  }
  if (props.mode === "theme") {
    return `What's been happening in ${props.theme.themeName}?`;
  }
  return `What's been happening in ${props.hub.branchLabel}?`;
}

const ONBOARDING_RATE_LIMIT_RETRY_MS = 3_000;

function isRateLimitFailure(status: number | null, message?: string | null): boolean {
  const m = message?.toLowerCase() ?? "";
  return status === 429 || m.includes("429") || m.includes("rate limit") || m.includes("quota");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function StreamOverlay(props: StreamOverlayProps) {
  const {
    initialDraft = "",
    initialPlaceholder,
    onboardingMode = false,
    onboardingQuestion,
    onClose,
    onCommitted,
    onClearPreview,
    onCardFocusHub,
    onExtracted,
    onOnboardingCommitSuccess,
    onCommitSuccess,
    onCommitFailed,
    onOnboardingFirstCardConfirmed,
    embed = false,
  } = props;

  const accent = accentColor(props);
  const isTheme = props.mode === "theme";
  const headerTitle = isTheme ? props.theme.themeName : props.hub.branchLabel;
  const headerSubtitle = isTheme ? "Stream" : props.hub.areaLabel;
  const placeholder = composerPlaceholder(props);

  const [phase, setPhase] = useState<Phase>("input");

  const [voiceUsedInSession, setVoiceUsedInSession] = useState(false);

  const [draft, setDraft] = useState(initialDraft);

  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onboardingRetryReady, setOnboardingRetryReady] = useState(false);

  const [extraction, setExtraction] = useState<StreamExtractResponse | null>(
    null,
  );

  const [narrative, setNarrative] = useState("");
  const [showSlowExtractHint, setShowSlowExtractHint] = useState(false);

  const [portalMounted, setPortalMounted] = useState(
    () => typeof window !== "undefined",
  );

  const inputMode = voiceUsedInSession ? "voice" : "text";

  const handleRequestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 300);
  }, [closing, onClose]);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    setDraft(initialDraft);

    setVoiceUsedInSession(false);
    setNotice(null);
  }, [sessionKey(props), initialDraft]);

  useEffect(() => {
    if (onboardingMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) handleRequestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, handleRequestClose, onboardingMode]);

  const handleExtract = useCallback(async () => {
    const text = draft.trim();

    if (!text) {
      setError(
        isTheme
          ? "Say something about this theme first."
          : "Say something about this hub first.",
      );

      return;
    }

    const body =
      props.mode === "theme"
        ? { themeId: props.theme.themeId, input: text, inputMode }
        : {
            hubId: props.hub.branchId,

            input: text,

            inputMode,
          };

    setBusy(true);

    setError(null);
    setNotice(null);
    setOnboardingRetryReady(false);

    setNarrative("");

    setExtraction(null);
    setShowSlowExtractHint(false);

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

      if (!result.ok && onboardingMode && isRateLimitFailure(result.status, result.error)) {
        console.error("[onboarding Stream] extract rate limited; retrying once", {
          status: result.status,
          error: result.error,
          body,
        });
        setError("Just a moment — almost ready.");
        await delay(ONBOARDING_RATE_LIMIT_RETRY_MS);
        result = await extractOnce();
        if (!result.ok) {
          console.error("[onboarding Stream] extract retry failed", {
            status: result.status,
            error: result.error,
            body,
          });
          setError("Something went wrong — tap to try again.");
          setOnboardingRetryReady(true);
          setPhase("input");
          return;
        }
      }

      if (!result.ok) {
        const { status, error } = result;
        if (onboardingMode) {
          console.error("[onboarding Stream] extract failed", {
            status,
            error,
            body,
          });
        }
        setError(onboardingMode ? "Something went wrong — tap to try again." : streamExtractUserMessage(status, error));
        if (onboardingMode) setOnboardingRetryReady(true);

        setPhase("input");

        return;
      }

      const extractionData = result.data;
      if (streamConfirmationCardCount(extractionData) === 0) {
        queueMemoryUpdateFromClient(body.input);
        setNotice(EMPTY_STREAM_MESSAGE);
        setPhase("input");
        return;
      }
      setNarrative(extractionData.narrativeSentence ?? "");
      setExtraction(extractionData);

      setPhase("confirm");
    } catch (err) {
      if (onboardingMode) {
        console.error("[onboarding Stream] extract threw", err);
        if (isRateLimitFailure(null, err instanceof Error ? err.message : String(err))) {
          setError("Just a moment — almost ready.");
          await delay(ONBOARDING_RATE_LIMIT_RETRY_MS);
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
          } catch (retryErr) {
            console.error("[onboarding Stream] extract retry threw", retryErr);
          }
        }
        setError("Something went wrong — tap to try again.");
        setOnboardingRetryReady(true);
        setPhase("input");
        return;
      }
      setError(streamExtractCatchMessage(err));

      setPhase("input");
    } finally {
      setBusy(false);
    }
  }, [draft, inputMode, isTheme, onboardingMode, props]);

  const handleStartOver = useCallback(() => {
    onClearPreview?.();

    setPhase("input");

    setExtraction(null);

    setNarrative("");

    setError(null);
    setNotice(null);
    setOnboardingRetryReady(false);

    setDraft(initialDraft);

    setVoiceUsedInSession(false);
  }, [initialDraft, onClearPreview]);

  const handleDone = useCallback(() => {
    onCommitted();

    handleRequestClose();
  }, [handleRequestClose, onCommitted]);

  const extracting = phase === "extracting";

  useEffect(() => {
    if (!extracting) {
      setShowSlowExtractHint(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowSlowExtractHint(true);
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [extracting]);

  if (!embed && !portalMounted) return null;

  const composerDisabled = busy || extracting;
  const onboardingEmbed = Boolean(onboardingMode && embed);

  const shell = (
    <>
      <style dangerouslySetInnerHTML={{ __html: PF_ROADMAP_THEME_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: STREAM_CARD_ANIMATION_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: STREAM_CARD_VARIANT_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: responsiveActionsCss }} />
      <style dangerouslySetInnerHTML={{ __html: STREAM_PANEL_SLIDE_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: STREAM_COMPOSER_CSS }} />

      <div
        className={`pf-roadmap pf-stream-shell ${
          onboardingEmbed
            ? "pf-stream-onboarding-embed"
            : `pf-stream-overlay-root${closing ? " pf-stream-overlay-closing" : ""}`
        }`}
        role="dialog"
        aria-modal={onboardingEmbed ? "true" : "false"}
        aria-labelledby="stream-overlay-title"
        style={{ ["--stream-accent" as string]: accent }}
      >
        <div className={onboardingEmbed ? undefined : "pf-stream-drawer-inner"}>
          <div className="pf-stream-drawer-header">
            {!onboardingMode ? (
              <button type="button" className="pf-stream-back-btn" onClick={handleRequestClose} disabled={busy}>
                ← Back
              </button>
            ) : null}
            {!onboardingMode ? <div className="pf-stream-state-badge">C · Stream active</div> : null}
          </div>

          <h2 id="stream-overlay-title" style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}>
            {onboardingEmbed ? "Onboarding Stream" : `${headerSubtitle} · ${headerTitle}`}
          </h2>

          {extracting ? (
            <div className="pf-stream-narrative-pill" aria-live="polite" aria-busy="true">
              <strong>Listening</strong>
              {narrative || "Making sense of this…"}
              {showSlowExtractHint ? (
                <div className="pf-stream-slow-extract-hint">
                  Still working — complex inputs take a moment.
                </div>
              ) : null}
            </div>
          ) : null}

          {phase === "confirm" && extraction ? (
            <div className={onboardingEmbed ? "pf-stream-confirm-onboarding" : "pf-stream-confirm-float"}>
              {error ? (
                <p
                  style={{
                    ...STREAM_ASSISTANT_MESSAGE_STYLE,
                    margin: "0 0 10px",
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(11, 10, 15, 0.78)",
                  }}
                >
                  {error}
                </p>
              ) : null}
              {props.mode === "theme" ? (
                <StreamConfirmation
                  mode="theme"
                  theme={props.theme}
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
                  onOnboardingCommitSuccess={onOnboardingCommitSuccess}
                  onCommitSuccess={onCommitSuccess}
                  onCommitFailed={onCommitFailed}
                  onOnboardingFirstCardConfirmed={onOnboardingFirstCardConfirmed}
                />
              ) : (
                <StreamConfirmation
                  mode="hub"
                  hub={props.hub}
                  extraction={extraction}
                  busy={busy}
                  onboardingMode={onboardingMode}
                  onStartOver={handleStartOver}
                  onClearPreview={onClearPreview}
                  onDone={handleDone}
                  onCardFocusHub={onCardFocusHub}
                  onExtracted={onExtracted}
                  onOnboardingCommitSuccess={onOnboardingCommitSuccess}
                  onCommitSuccess={onCommitSuccess}
                  onCommitFailed={onCommitFailed}
                  onOnboardingFirstCardConfirmed={onOnboardingFirstCardConfirmed}
                />
              )}
            </div>
          ) : null}

          <div className={onboardingEmbed ? "pf-stream-composer-onboarding" : "pf-stream-composer-float"}>
            {onboardingMode ? (
              <p
                className={onboardingEmbed ? "pf-stream-onboarding-hint" : "pf-stream-onboarding-hint pf-stream-onboarding-hint-float"}
              >
                Take your time. Sentences are fine.
              </p>
            ) : null}
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

            {error && phase !== "confirm" ? (
              <div>
                <p
                  style={{
                    ...STREAM_ASSISTANT_MESSAGE_STYLE,
                    margin: "10px 0 0",
                    padding: "0 2px",
                  }}
                >
                  {error}
                </p>
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
              <p style={STREAM_ASSISTANT_MESSAGE_STYLE}>{notice}</p>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );

  if (embed) return shell;

  return createPortal(shell, document.body);
}
