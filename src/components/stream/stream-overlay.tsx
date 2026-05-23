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

const STREAM_PANEL_SLIDE_CSS = `

@keyframes streamOverlayFloatIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes streamOverlayCenteredFloatIn {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.pf-stream-overlay-root {
  position: fixed;
  inset: 0;
  z-index: 200000;
  pointer-events: none;
  color: var(--rm-text1, var(--color-text-primary));
}

.pf-stream-overlay-root > * {
  pointer-events: auto;
}

.pf-stream-click-away {
  position: absolute;
  inset: 0;
  z-index: 1;
  border: 0;
  background: transparent;
  cursor: default;
}

.pf-stream-back-btn {
  position: absolute;
  top: 68px;
  left: 22px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px 7px 9px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(11, 10, 15, 0.6);
  color: rgba(255, 255, 255, 0.78);
  font-family: var(--font-pf-roadmap-sans), "Inter", system-ui, sans-serif;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.pf-stream-state-badge {
  position: absolute;
  top: 68px;
  right: 22px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(11, 10, 15, 0.55);
  color: rgba(255, 255, 255, 0.55);
  font-family: var(--font-pf-roadmap-mono), "JetBrains Mono", monospace;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
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
  position: absolute;
  top: 110px;
  right: 36px;
  z-index: 3;
  width: min(480px, calc(100vw - 72px));
  height: min(72vh, 640px);
  animation: streamOverlayFloatIn 220ms ease-out both;
}

.pf-stream-confirm-float > div {
  height: 100%;
}

.pf-stream-composer-float {
  position: absolute;
  left: 50%;
  bottom: 28px;
  z-index: 4;
  width: min(720px, calc(100vw - 96px));
  transform: translateX(-50%);
  animation: streamOverlayCenteredFloatIn 220ms ease-out both;
}

.pf-stream-narrative-pill {
  position: absolute;
  left: 50%;
  bottom: 202px;
  z-index: 4;
  width: min(720px, calc(100vw - 96px));
  transform: translateX(-50%);
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(11, 10, 15, 0.78);
  color: rgba(255, 255, 255, 0.68);
  font-size: 14px;
  line-height: 1.5;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  animation: streamOverlayCenteredFloatIn 220ms ease-out both;
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

@media (max-width: 900px) {
  .pf-stream-confirm-float {
    right: 18px;
    left: 18px;
    width: auto;
  }

  .pf-stream-composer-float,
  .pf-stream-narrative-pill {
    width: calc(100vw - 36px);
  }
}

@media (max-height: 680px) {
  .pf-stream-confirm-float {
    top: 88px;
    height: 48vh;
  }

  .pf-stream-confirm-float > div {
    height: 100%;
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
  margin: 0 0 10px;
  padding: 0 2px;
  font-size: 13px;
  line-height: 1.45;
  color: rgba(245, 243, 250, 0.55);
  font-family: var(--font-pf-roadmap-sans), "DM Sans", sans-serif;
}

.pf-stream-onboarding-hint-float {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  width: min(720px, calc(100vw - 96px));
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;
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
  min-height: 280px;
  margin-top: 16px;
  animation: none;
}

.pf-stream-confirm-onboarding > div {
  height: auto;
  min-height: 280px;
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

  const [error, setError] = useState<string | null>(null);

  const [extraction, setExtraction] = useState<StreamExtractResponse | null>(
    null,
  );

  const [narrative, setNarrative] = useState("");

  const [portalMounted, setPortalMounted] = useState(
    () => typeof window !== "undefined",
  );

  const inputMode = voiceUsedInSession ? "voice" : "text";

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    setDraft(initialDraft);

    setVoiceUsedInSession(false);
  }, [sessionKey(props), initialDraft]);

  useEffect(() => {
    if (onboardingMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose, onboardingMode]);

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

    setNarrative("");

    setExtraction(null);

    setPhase("extracting");

    try {
      const res = await fetch("/api/stream/extract", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        if (onboardingMode) {
          console.error("[onboarding Stream] extract failed", {
            status: res.status,
            error: data?.error ?? null,
            body,
          });
        }
        setError(streamExtractUserMessage(res.status, data?.error ?? null));

        setPhase("input");

        return;
      }

      const extractionData = data as StreamExtractResponse;
      setNarrative(extractionData.narrativeSentence ?? "");
      setExtraction(extractionData);

      setPhase("confirm");
    } catch (err) {
      if (onboardingMode) {
        console.error("[onboarding Stream] extract threw", err);
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

    setDraft(initialDraft);

    setVoiceUsedInSession(false);
  }, [initialDraft, onClearPreview]);

  const handleDone = useCallback(() => {
    onCommitted();

    onClose();
  }, [onClose, onCommitted]);

  if (!embed && !portalMounted) return null;

  const extracting = phase === "extracting";
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
        className={`pf-roadmap pf-stream-shell ${onboardingEmbed ? "pf-stream-onboarding-embed" : "pf-stream-overlay-root"}`}
        role="dialog"
        aria-modal={onboardingEmbed ? "true" : "false"}
        aria-labelledby="stream-overlay-title"
        style={{ ["--stream-accent" as string]: accent }}
      >
        {!onboardingMode ? (
          <button
            type="button"
            className="pf-stream-click-away"
            aria-label="Close Stream"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
          />
        ) : null}

        {!onboardingMode ? (
          <button type="button" className="pf-stream-back-btn" onClick={onClose} disabled={busy}>
            ← Back to map
          </button>
        ) : null}

        {!onboardingMode ? <div className="pf-stream-state-badge">C · Stream active</div> : null}

        <h2 id="stream-overlay-title" style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}>
          {onboardingEmbed ? "Onboarding Stream" : `${headerSubtitle} · ${headerTitle}`}
        </h2>

        {extracting ? (
          <div className="pf-stream-narrative-pill" aria-live="polite" aria-busy="true">
            <strong>Listening</strong>
            {narrative || "Making sense of this…"}
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
            showFooterHints={!onboardingMode}
            sendLabel="Send"
          />

          {error && phase !== "confirm" ? (
            <p
              style={{
                ...STREAM_ASSISTANT_MESSAGE_STYLE,
                margin: "10px 0 0",
                padding: "0 2px",
              }}
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );

  if (embed) return shell;

  return createPortal(shell, document.body);
}
