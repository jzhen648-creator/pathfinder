"use client";

import {
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
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(11, 10, 15, 0.86);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
}
.pf-stream-composer textarea {
  width: 100%;
  box-sizing: border-box;
  border: none;
  background: transparent;
  resize: vertical;
  min-height: 110px;
  max-height: 40vh;
  padding: 14px 52px 14px 16px;
  font-family: var(--font-pf-roadmap-sans), system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.6;
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
.pf-stream-composer-actions {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  voiceOptions?: UseVoiceInputOptions;
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
  voiceOptions,
}: StreamComposerProps) {
  const voice = useVoiceInput(voiceOptions ?? { enabled: true });
  const holdingRef = useRef(false);

  const canSend = Boolean(value.trim()) && !disabled && !busy;
  const showMic = voice.isBrowserSupported && voiceOptions?.enabled !== false;
  const voiceDisabledReason = voice.unavailableReason ?? "Hold to speak";

  const appendTranscript = (spoken: string) => {
    const chunk = spoken.trim();
    if (!chunk) return;
    onVoiceUsed?.();
    onChange(value.trim() ? `${value.trim()} ${chunk}` : chunk);
  };

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || busy || !voice.isActive || voice.transcribing) return;
    e.preventDefault();
    holdingRef.current = true;
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
    appendTranscript(spoken);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (canSend) onSend();
  };

  const sendAccent = accent ?? "var(--stream-accent, #7B68C8)";

  return (
    <div className="pf-stream-composer">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={5}
        aria-keyshortcuts="Enter"
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
          aria-label="Send"
          title="Send"
          style={sendButtonStyle(canSend, sendAccent)}
        >
          <StreamSendIcon />
        </button>
      </div>
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
            ? "Transcribing…"
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
