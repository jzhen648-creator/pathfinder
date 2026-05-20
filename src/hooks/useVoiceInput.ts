"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

function micUnavailableMessage(): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Microphone requires a secure page. Open the app at https://… or http://localhost (not a LAN IP over HTTP).";
  }
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "Voice recording is not supported in this browser. Use Chrome or Edge on desktop.";
  }
  return "Voice recording is not available.";
}

export type UseVoiceInputOptions = {
  enabled?: boolean;
};

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const { enabled = true } = options;

  const isBrowserSupported =
    typeof window !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined";

  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<"checking" | "available" | "unavailable">(
    "checking",
  );
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string | undefined>(undefined);
  const startingRef = useRef(false);
  const abortStartRef = useRef(false);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      releaseStream();
    };
  }, [releaseStream]);

  useEffect(() => {
    if (!enabled || !isBrowserSupported) {
      setAvailability("unavailable");
      setUnavailableReason(null);
      return;
    }

    const controller = new AbortController();
    setAvailability("checking");
    setUnavailableReason(null);

    void fetch("/api/transcribe/status", { signal: controller.signal })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          available?: boolean;
          reason?: string | null;
          error?: string;
        };
        if (res.ok && data.available) {
          setAvailability("available");
          setUnavailableReason(null);
          return;
        }
        setAvailability("unavailable");
        setUnavailableReason(
          data.reason ?? data.error ?? "Voice transcription is unavailable.",
        );
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAvailability("unavailable");
        setUnavailableReason("Voice transcription is unavailable.");
      });

    return () => controller.abort();
  }, [enabled, isBrowserSupported]);

  const stopListening = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      if (startingRef.current) {
        abortStartRef.current = true;
        resolve("");
        return;
      }

      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        releaseStream();
        setListening(false);
        resolve("");
        return;
      }

      const onStop = async () => {
        recorder.removeEventListener("stop", onStop);
        setListening(false);

        const mime = mimeTypeRef.current ?? "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        releaseStream();

        if (blob.size < 400) {
          setError("No speech detected. Hold the button a little longer.");
          resolve("");
          return;
        }

        setTranscribing(true);
        setError(null);

        try {
          const body = new FormData();
          const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
          body.append("audio", blob, `recording.${ext}`);

          const res = await fetch("/api/transcribe", {
            method: "POST",
            body,
          });
          const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
          if (!res.ok) {
            if (res.status === 401) {
              setError("Sign in again to use voice input.");
            } else if (res.status === 503) {
              setError("Voice transcription is temporarily unavailable. Try again in a moment.");
            } else {
              setError(String(data.error ?? `Transcription failed (${res.status})`));
            }
            resolve("");
            return;
          }
          resolve(String(data.text ?? "").trim());
        } catch {
          setError("Could not reach transcription service. Check your connection.");
          resolve("");
        } finally {
          setTranscribing(false);
        }
      };

      recorder.addEventListener("stop", onStop);
      try {
        recorder.stop();
      } catch {
        onStop();
      }
    });
  }, [releaseStream]);

  const startListening = useCallback(async () => {
    if (!enabled || !isBrowserSupported || availability !== "available") {
      if (unavailableReason) setError(unavailableReason);
      return;
    }

    setError(null);
    chunksRef.current = [];

    if (recorderRef.current) {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
      releaseStream();
    }

    if (!window.isSecureContext) {
      setError(micUnavailableMessage());
      return;
    }

    startingRef.current = true;
    abortStartRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (abortStartRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        startingRef.current = false;
        return;
      }
      streamRef.current = stream;

      const mimeType = pickRecorderMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = () => {
        setError("Recording failed.");
        setListening(false);
        releaseStream();
      };

      recorderRef.current = recorder;
      recorder.start(200);
      startingRef.current = false;
      setListening(true);
    } catch (e) {
      startingRef.current = false;
      releaseStream();
      setListening(false);
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("Microphone access denied. Allow the mic in your browser settings.");
      } else if (name === "NotFoundError") {
        setError("No microphone found.");
      } else {
        setError(micUnavailableMessage());
      }
    }
  }, [availability, enabled, isBrowserSupported, releaseStream, unavailableReason]);

  const clearError = useCallback(() => setError(null), []);

  return {
    isBrowserSupported,
    isActive: enabled && isBrowserSupported && availability === "available",
    listening,
    transcribing,
    error,
    unavailableReason,
    startListening,
    stopListening,
    clearError,
  };
}
