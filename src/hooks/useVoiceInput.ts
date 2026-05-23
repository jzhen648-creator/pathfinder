"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLiveSpeechSession,
  isLiveSpeechSupported,
  type LiveSpeechSession,
} from "@/lib/voice/live-speech-recognition";

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
  /** Show words in real time via browser speech recognition (no extra API calls). */
  liveTranscript?: boolean;
};

type CaptureMode = "live" | "record";

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const { enabled = true, liveTranscript = true } = options;

  const canRecord =
    typeof window !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined";

  const liveSpeechSupported = isLiveSpeechSupported();
  const preferLiveCapture = liveTranscript && liveSpeechSupported;

  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTranscriptText, setLiveTranscriptText] = useState("");
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
  const [availability, setAvailability] = useState<
    "unknown" | "checking" | "available" | "unavailable"
  >("unknown");
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string | undefined>(undefined);
  const startingRef = useRef(false);
  const abortStartRef = useRef(false);
  const liveSpeechRef = useRef<LiveSpeechSession | null>(null);
  const liveCommittedRef = useRef("");
  const captureModeRef = useRef<CaptureMode | null>(null);

  const clearLiveTranscript = useCallback(() => {
    liveCommittedRef.current = "";
    setLiveTranscriptText("");
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const stopLiveSpeech = useCallback((): string => {
    const session = liveSpeechRef.current;
    liveSpeechRef.current = null;
    if (!session) return liveCommittedRef.current.trim();
    const result = session.stop();
    liveCommittedRef.current = result;
    setLiveTranscriptText(result);
    return result;
  }, []);

  const abortLiveSpeech = useCallback(() => {
    liveSpeechRef.current?.abort();
    liveSpeechRef.current = null;
    clearLiveTranscript();
  }, [clearLiveTranscript]);

  const prefetchTranscribeStatus = useCallback(async () => {
    if (availability !== "unknown") return;
    setAvailability("checking");
    try {
      const res = await fetch("/api/transcribe/status");
      const data = (await res.json().catch(() => ({}))) as {
        available?: boolean;
        reason?: string | null;
        error?: string;
      };
      if (res.ok && data.available) {
        setAvailability("available");
        setUnavailableReason(null);
      } else {
        const reason = data.reason ?? data.error ?? "Voice transcription is unavailable.";
        setAvailability("unavailable");
        setUnavailableReason(reason);
      }
    } catch {
      setAvailability("unavailable");
      setUnavailableReason("Voice transcription is unavailable.");
    }
  }, [availability]);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      abortLiveSpeech();
      releaseStream();
    };
  }, [abortLiveSpeech, releaseStream]);

  useEffect(() => {
    if (!enabled || !canRecord) {
      setAvailability("unavailable");
      setUnavailableReason(null);
    }
  }, [canRecord, enabled]);

  const transcribeBlob = useCallback(async (blob: Blob, mime: string): Promise<string> => {
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
      return "";
    }
    return String(data.text ?? "").trim();
  }, []);

  const beginLiveSpeech = useCallback((): boolean => {
    const session = createLiveSpeechSession({
      onPartial: (partial) => {
        setLiveTranscriptText(partial);
      },
      onFinalSegment: () => {
        /* display stays in sync via onPartial */
      },
      onError: (message) => {
        if (message === "not-allowed") {
          setError("Microphone access denied. Allow the mic in your browser settings.");
          return;
        }
        if (message === "network") {
          setError("Live captions need an internet connection in Chrome.");
        }
      },
    });
    if (!session) return false;
    liveSpeechRef.current = session;
    return true;
  }, []);

  const stopListening = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      if (startingRef.current) {
        abortStartRef.current = true;
        abortLiveSpeech();
        captureModeRef.current = null;
        setCaptureMode(null);
        resolve("");
        return;
      }

      const speechText = stopLiveSpeech();
      const mode = captureModeRef.current;
      captureModeRef.current = null;
      setCaptureMode(null);

      const recorder = recorderRef.current;
      if (mode === "live" || !recorder || recorder.state === "inactive") {
        releaseStream();
        setListening(false);
        const result = speechText;
        clearLiveTranscript();
        if (!result) {
          setError("No speech detected. Hold the button a little longer.");
        }
        resolve(result);
        return;
      }

      const onStop = async () => {
        recorder.removeEventListener("stop", onStop);
        setListening(false);

        const mime = mimeTypeRef.current ?? "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        releaseStream();

        if (blob.size < 400) {
          const result = speechText;
          clearLiveTranscript();
          if (result) {
            resolve(result);
            return;
          }
          setError("No speech detected. Hold the button a little longer.");
          resolve("");
          return;
        }

        setTranscribing(true);
        setError(null);

        try {
          const geminiText = await transcribeBlob(blob, mime);
          const result = geminiText || speechText;
          clearLiveTranscript();
          resolve(result);
        } catch {
          clearLiveTranscript();
          if (speechText) {
            resolve(speechText);
            return;
          }
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
  }, [
    abortLiveSpeech,
    clearLiveTranscript,
    releaseStream,
    stopLiveSpeech,
    transcribeBlob,
  ]);

  const startRecordCapture = useCallback(async () => {
    let resolvedAvailability = availability;

    if (availability === "unknown") {
      setAvailability("checking");
      try {
        const res = await fetch("/api/transcribe/status");
        const data = (await res.json().catch(() => ({}))) as {
          available?: boolean;
          reason?: string | null;
          error?: string;
        };
        if (res.ok && data.available) {
          setAvailability("available");
          setUnavailableReason(null);
          resolvedAvailability = "available";
        } else {
          const reason = data.reason ?? data.error ?? "Voice transcription is unavailable.";
          setAvailability("unavailable");
          setUnavailableReason(reason);
          setError(reason);
          startingRef.current = false;
          setListening(false);
          captureModeRef.current = null;
          setCaptureMode(null);
          return;
        }
      } catch {
        setAvailability("unavailable");
        setUnavailableReason("Voice transcription is unavailable.");
        setError("Voice transcription is unavailable.");
        startingRef.current = false;
        setListening(false);
        captureModeRef.current = null;
        setCaptureMode(null);
        return;
      }
    }

    if (resolvedAvailability !== "available") {
      if (unavailableReason) setError(unavailableReason);
      startingRef.current = false;
      setListening(false);
      captureModeRef.current = null;
      setCaptureMode(null);
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    if (abortStartRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      startingRef.current = false;
      setListening(false);
      captureModeRef.current = null;
      setCaptureMode(null);
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
      abortLiveSpeech();
      releaseStream();
      captureModeRef.current = null;
      setCaptureMode(null);
    };

    recorderRef.current = recorder;
    recorder.start(200);
    captureModeRef.current = "record";
    setCaptureMode("record");
    startingRef.current = false;
  }, [availability, abortLiveSpeech, releaseStream, unavailableReason]);

  const startListening = useCallback(async () => {
    const canUseLive = preferLiveCapture && typeof window !== "undefined" && window.isSecureContext;
    const canUseRecord = canRecord;

    if (!enabled || (!canUseLive && !canUseRecord)) {
      if (unavailableReason) setError(unavailableReason);
      else setError(micUnavailableMessage());
      return;
    }

    setError(null);
    chunksRef.current = [];
    clearLiveTranscript();
    abortLiveSpeech();

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
    setListening(true);

    // Live captions need exclusive mic access — do not open MediaRecorder while held.
    if (canUseLive && beginLiveSpeech()) {
      captureModeRef.current = "live";
      setCaptureMode("live");
      startingRef.current = false;
      void prefetchTranscribeStatus();
      return;
    }

    if (!canUseRecord) {
      startingRef.current = false;
      setListening(false);
      setError("Live speech is unavailable. Try Chrome or Edge on desktop.");
      return;
    }

    try {
      await startRecordCapture();
    } catch (e) {
      startingRef.current = false;
      abortLiveSpeech();
      releaseStream();
      setListening(false);
      captureModeRef.current = null;
      setCaptureMode(null);

      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("Microphone access denied. Allow the mic in your browser settings.");
      } else if (name === "NotFoundError") {
        setError("No microphone found.");
      } else {
        setError(micUnavailableMessage());
      }
    }
  }, [
    abortLiveSpeech,
    beginLiveSpeech,
    canRecord,
    clearLiveTranscript,
    enabled,
    preferLiveCapture,
    prefetchTranscribeStatus,
    releaseStream,
    startRecordCapture,
    unavailableReason,
  ]);

  const clearError = useCallback(() => setError(null), []);

  const isActive =
    enabled &&
    (preferLiveCapture
      ? typeof window !== "undefined" && window.isSecureContext
      : canRecord && (availability === "available" || availability === "unknown"));

  return {
    isBrowserSupported: canRecord,
    liveSpeechSupported,
    captureMode,
    isActive,
    listening,
    transcribing,
    liveTranscriptText,
    error,
    unavailableReason,
    startListening,
    stopListening,
    clearError,
  };
}
