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

/** Reserved height for narrative strip so the composer does not jump when extraction starts. */

const STREAM_NARRATIVE_MIN_HEIGHT_PX = 96;

const STREAM_NARRATIVE_MAX_HEIGHT_PX = 200;

type Phase = "input" | "extracting" | "confirm";

export const STREAM_PANEL_WIDTH_PX = 380;

const STREAM_PANEL_SLIDE_CSS = `

@keyframes streamPanelSlideIn {

  from { transform: translateX(100%); }

  to { transform: translateX(0); }

}

.pf-stream-panel {

  animation: streamPanelSlideIn 250ms ease-out both;

}

`;

type StreamOverlayBaseProps = {
  initialDraft?: string;

  initialPlaceholder?: string;

  onClose: () => void;

  onCommitted: () => void;

  onClearPreview?: () => void;

  /** Pan the tree camera to the hub for the active confirmation card. */

  onCardFocusHub?: (areaId: string, branchId: string) => void;

  /** Reload tree after extract commits ambiguous items. */

  onExtracted?: () => void;

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
  if (props.mode === "theme") {
    return `What's been happening in ${props.theme.themeName}?`;
  }

  return `What's been happening in ${props.hub.branchLabel}?`;
}

export function StreamOverlay(props: StreamOverlayProps) {
  const {
    initialDraft = "",

    initialPlaceholder,

    onClose,

    onCommitted,

    onClearPreview,

    onCardFocusHub,

    onExtracted,

    embed = false,
  } = props;

  const accent = accentColor(props);

  const isTheme = props.mode === "theme";

  const headerTitle = isTheme ? props.theme.themeName : props.hub.branchLabel;

  const headerSubtitle = isTheme ? "Stream" : props.hub.areaLabel;

  const placeholder = initialPlaceholder?.trim() || composerPlaceholder(props);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

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
        setError(streamExtractUserMessage(res.status, data?.error ?? null));

        setPhase("input");

        return;
      }

      const extractionData = data as StreamExtractResponse;
      setNarrative(extractionData.narrativeSentence ?? "");
      setExtraction(extractionData);

      setPhase("confirm");
    } catch (err) {
      setError(streamExtractCatchMessage(err));

      setPhase("input");
    } finally {
      setBusy(false);
    }
  }, [draft, inputMode, isTheme, props]);

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

  const shell = (
    <>
      <style dangerouslySetInnerHTML={{ __html: PF_ROADMAP_THEME_CSS }} />

      <style dangerouslySetInnerHTML={{ __html: STREAM_CARD_ANIMATION_CSS }} />

      <style dangerouslySetInnerHTML={{ __html: STREAM_CARD_VARIANT_CSS }} />

      <style dangerouslySetInnerHTML={{ __html: responsiveActionsCss }} />

      <style dangerouslySetInnerHTML={{ __html: STREAM_PANEL_SLIDE_CSS }} />

      <style dangerouslySetInnerHTML={{ __html: STREAM_COMPOSER_CSS }} />

      <div
        className="pf-roadmap pf-stream-shell pf-stream-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="stream-overlay-title"
        style={{
          position: "fixed",

          right: 0,

          top: 0,

          bottom: 0,

          width: STREAM_PANEL_WIDTH_PX,

          zIndex: 200000,

          display: "flex",

          flexDirection: "column",

          background: "#111210",

          borderLeft: "1px solid rgba(255,255,255,0.08)",

          boxShadow: "-12px 0 40px rgba(0,0,0,0.35)",

          color: "var(--rm-text1, var(--color-text-primary))",

          ["--stream-accent" as string]: accent,
        }}
      >
        <header
          style={{
            flexShrink: 0,

            padding: "16px 22px",

            borderBottom: "1px solid var(--color-border-tertiary)",

            display: "flex",

            alignItems: "flex-start",

            justifyContent: "space-between",

            gap: 16,
          }}
        >
          <div>
            <p
              style={{
                margin: 0,

                fontSize: 11,

                fontWeight: 600,

                letterSpacing: ".07em",

                textTransform: "uppercase",

                color: "var(--color-text-tertiary)",
              }}
            >
              {headerSubtitle}
            </p>

            <h2
              id="stream-overlay-title"
              style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 600 }}
            >
              {headerTitle}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            style={{
              border: "none",

              background: "transparent",

              color: "var(--color-text-tertiary)",

              fontSize: 22,

              cursor: "pointer",

              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        {phase !== "confirm" ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div
              aria-live="polite"
              aria-busy={extracting}
              aria-hidden={!extracting}
              style={{
                flex: 1,

                minHeight: extracting ? STREAM_NARRATIVE_MIN_HEIGHT_PX : 0,

                maxHeight: extracting
                  ? STREAM_NARRATIVE_MAX_HEIGHT_PX
                  : undefined,

                overflow: extracting ? "auto" : "hidden",

                padding: extracting ? "16px 22px 12px" : 0,

                borderBottom: extracting
                  ? "1px solid var(--color-border-tertiary)"
                  : "1px solid transparent",

                opacity: extracting ? 1 : 0,

                pointerEvents: extracting ? "auto" : "none",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",

                  fontSize: 11,

                  fontWeight: 600,

                  letterSpacing: ".07em",

                  textTransform: "uppercase",

                  color: "var(--color-text-tertiary)",
                }}
              >
                Listening…
              </p>

              <div
                style={{
                  fontSize: 15,

                  lineHeight: 1.55,

                  color: "var(--color-text-secondary)",

                  whiteSpace: "pre-wrap",

                  minHeight: 24,
                }}
              >
                {narrative || "…"}
              </div>

              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 13,
                  color: "var(--color-text-tertiary)",
                }}
              >
                {narrative
                  ? "Mapping what belongs on your tree…"
                  : "Making sense of this…"}
              </p>
            </div>

            <div
              style={{
                flexShrink: 0,

                padding: "16px 22px 20px",

                borderTop: extracting
                  ? "none"
                  : "1px solid var(--color-border-tertiary)",
              }}
            >
              <StreamComposer
                value={draft}
                onChange={setDraft}
                placeholder={placeholder}
                disabled={composerDisabled}
                busy={busy}
                accent={accent}
                onSend={() => void handleExtract()}
                onVoiceUsed={() => setVoiceUsedInSession(true)}
                voiceOptions={{ enabled: true }}
              />

              {error ? (
                <p style={STREAM_ASSISTANT_MESSAGE_STYLE}>{error}</p>
              ) : null}
            </div>
          </div>
        ) : extraction ? (
          <>
            {error ? (
              <p
                style={{
                  ...STREAM_ASSISTANT_MESSAGE_STYLE,
                  margin: 0,
                  padding: "8px 22px",
                }}
              >
                {error}
              </p>
            ) : null}

            {narrative ? (
              <div
                style={{
                  margin: "14px 22px 0",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${accent}44`,
                  background: `${accent}10`,
                  fontSize: 15,
                  lineHeight: 1.5,
                  color: "var(--color-text-secondary)",
                }}
              >
                {narrative}
              </div>
            ) : null}

            {props.mode === "theme" ? (
              <StreamConfirmation
                mode="theme"
                theme={props.theme}
                extraction={extraction}
                busy={busy}
                inputText={draft}
                inputMode={inputMode}
                onStartOver={handleStartOver}
                onClearPreview={onClearPreview}
                onDone={handleDone}
                onCardFocusHub={onCardFocusHub}
                onExtracted={onExtracted}
              />
            ) : (
              <StreamConfirmation
                mode="hub"
                hub={props.hub}
                extraction={extraction}
                busy={busy}
                onStartOver={handleStartOver}
                onClearPreview={onClearPreview}
                onDone={handleDone}
                onCardFocusHub={onCardFocusHub}
                onExtracted={onExtracted}
              />
            )}
          </>
        ) : null}
      </div>
    </>
  );

  if (embed) return shell;

  return createPortal(shell, document.body);
}
