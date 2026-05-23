"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  StreamMicIcon,
  StreamSendIcon,
} from "@/components/stream/stream-composer-icons";
import type { UseVoiceInputOptions } from "@/hooks/useVoiceInput";
import { useVoiceInput } from "@/hooks/useVoiceInput";

export const STREAM_COMPOSER_CSS = `
.pf-stream-composer {
  position: relative;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: none;
  overflow: hidden;
}
.pf-stream-composer textarea {
  width: 100%;
  box-sizing: border-box;
  border: none;
  background: transparent;
  resize: none;
  min-height: 44px;
  max-height: 86px;
  overflow-y: auto;
  padding: 10px 58px 10px 14px;
  font-family: "Lora", var(--font-pf-roadmap-serif), Georgia, serif;
  font-size: 15px;
  line-height: 1.45;
  letter-spacing: 0.003em;
  color: rgba(255, 255, 255, 0.92);
  outline: none;
}
.pf-stream-composer textarea::placeholder {
  color: var(--color-text-tertiary);
}
.pf-stream-composer textarea:disabled {
  opacity: 0.85;
  cursor: not-allowed;
}
.pf-stream-composer textarea.pf-stream-composer-live {
  color: rgba(255, 255, 255, 0.92);
}
.pf-stream-composer-live-hint {
  font-style: italic;
  color: rgba(255, 255, 255, 0.58);
}
.pf-stream-composer-actions {
  position: absolute;
  right: 8px;
  top: 5px;
  display: flex;
  flex-direction: row;
  gap: 6px;
}
.pf-stream-composer-footer {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-family: var(--font-pf-roadmap-mono), ui-monospace, monospace;
  font-size: 10.5px;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.32);
  pointer-events: none;
}
.pf-stream-composer-footer span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.pf-stream-composer-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1D9E75;
  box-shadow: 0 0 6px #1D9E75;
}
`;

export type StreamComposerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  busy?: boolean;
  onSend: () => void;
  onVoiceUsed?: () => void;
  accent?: string;
  proposalCount?: number;
  voiceOptions?: UseVoiceInputOptions;
  showFooterHints?: boolean;
  sendLabel?: string;
};

export function StreamComposer({
  value,
  onChange,
  placeholder,
  disabled = false,
  busy = false,
  onSend,
  onVoiceUsed,
  accent,
  proposalCount = 0,
  voiceOptions,
  showFooterHints = true,
  sendLabel = "Send",
}: StreamComposerProps) {
  const voice = useVoiceInput(voiceOptions ?? { enabled: true });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const holdingRef = useRef(false);
  const baseAtListenRef = useRef("");

  const canSend = Boolean(value.trim()) && !disabled && !busy;
  const showMic = voice.isBrowserSupported && voiceOptions?.enabled !== false;
  const voiceDisabledReason = voice.unavailableReason ?? "Hold to speak";

  const voiceSessionActive = voice.listening || voice.transcribing;
  const liveSuffix = voice.liveTranscriptText;
  const displayValue =
    voiceSessionActive && liveSuffix
      ? baseAtListenRef.current.trim()
        ? `${baseAtListenRef.current.trim()} ${liveSuffix}`
        : liveSuffix
      : voiceSessionActive
        ? baseAtListenRef.current
        : value;

  const mergeTranscript = (base: string, spoken: string) => {
    const chunk = spoken.trim();
    if (!chunk) return base;
    onVoiceUsed?.();
    return base.trim() ? `${base.trim()} ${chunk}` : chunk;
  };

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || busy || !voice.isActive || voice.transcribing) return;
    e.preventDefault();
    holdingRef.current = true;
    baseAtListenRef.current = value;
    voice.clearError();
    void voice.startListening();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handlePointerUp = async (e: PointerEvent<HTMLButtonElement>) => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const spoken = await voice.stopListening();
    onChange(mergeTranscript(baseAtListenRef.current, spoken));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (canSend) onSend();
  };

  const sendAccent = accent ?? "var(--stream-accent, #7B68C8)";

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 86)}px`;
  }, [displayValue]);

  return (
    <div className="pf-stream-composer">
      <textarea
        ref={textareaRef}
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || voiceSessionActive}
        readOnly={voiceSessionActive}
        placeholder={placeholder}
        rows={1}
        aria-keyshortcuts="Enter"
        aria-live={voice.listening ? "polite" : undefined}
        className={voice.listening ? "pf-stream-composer-live" : undefined}
      />
      <div className="pf-stream-composer-actions">
        {showMic ? (
          <button
            type="button"
            disabled={disabled || busy || !voice.isActive || voice.transcribing}
            onPointerDown={handlePointerDown}
            onPointerUp={(e) => void handlePointerUp(e)}
            onPointerLeave={(e) => void handlePointerUp(e)}
            onPointerCancel={(e) => void handlePointerUp(e)}
            aria-label="Hold to speak"
            aria-pressed={voice.listening}
            title={voice.isActive ? "Hold to speak" : voiceDisabledReason}
            style={micButtonStyle(
              voice.listening,
              disabled || busy || !voice.isActive,
            )}
          >
            <StreamMicIcon />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label={sendLabel}
          title={sendLabel}
          style={sendButtonStyle(canSend, sendAccent)}
        >
          <StreamSendIcon />
        </button>
      </div>
      {showFooterHints ? (
        <div className="pf-stream-composer-footer" aria-hidden>
          <span>
            <i className="pf-stream-composer-live-dot" />
            Listening · {proposalCount} {proposalCount === 1 ? "proposal" : "proposals"} so far
          </span>
          <span>⌘↵ {sendLabel.toLowerCase()} · ⎋ exit</span>
        </div>
      ) : null}
      {voice.transcribing || voice.listening ? (
        <p
          aria-live="polite"
          style={{
            margin: "8px 0 0",
            padding: "0 2px",
            fontSize: 13,
            color: "var(--color-text-tertiary)",
          }}
        >
          {voice.transcribing
            ? "Polishing transcript…"
            : voice.captureMode === "live"
              ? voice.liveTranscriptText
                ? "Listening…"
                : "Listening… speak now"
              : voice.listening
                ? "Recording… release when done"
                : null}
        </p>
      ) : null}
      {voice.error ? (
        <p
          style={{ margin: "8px 0 0", fontSize: 13, color: "#b91c1c" }}
          role="alert"
        >
          {voice.error}
        </p>
      ) : null}
    </div>
  );
}

function micButtonStyle(listening: boolean, inactive: boolean): CSSProperties {
  return {
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: "50%",
    touchAction: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: listening
      ? "2px solid var(--stream-accent, #7B68C8)"
      : "1.5px solid var(--color-border-tertiary)",
    background: listening ? "rgba(123, 104, 200, 0.2)" : "transparent",
    color: "var(--color-text-primary)",
    cursor: inactive ? "not-allowed" : "pointer",
    opacity: inactive ? 0.45 : 1,
    padding: 0,
  };
}

function sendButtonStyle(enabled: boolean, accent: string): CSSProperties {
  return {
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: enabled ? accent : "var(--color-border-tertiary)",
    color: enabled ? "#0c0a09" : "var(--color-text-tertiary)",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.45,
    padding: 0,
  };
}
