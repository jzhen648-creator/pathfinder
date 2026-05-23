/**
 * Browser live speech-to-text (Web Speech API).
 * Swappable later for native iOS/Android partial recognition in the mobile app.
 */

export type LiveSpeechHandlers = {
  onPartial: (text: string) => void;
  onFinalSegment: (text: string) => void;
  onError?: (message: string) => void;
};

export type LiveSpeechSession = {
  stop: () => string;
  abort: () => void;
};

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function isLiveSpeechSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export function createLiveSpeechSession(
  handlers: LiveSpeechHandlers,
  lang = "en-GB",
): LiveSpeechSession | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  let active = true;
  let recognition: SpeechRecognition | null = null;
  const committedRef: string[] = [];
  let partial = "";

  const emitPartial = () => {
    const combined = [...committedRef, partial].filter(Boolean).join(" ").trim();
    handlers.onPartial(combined);
  };

  const bindRecognition = (rec: SpeechRecognition) => {
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const piece = String(result[0]?.transcript ?? "").trim();
        if (!piece) continue;
        if (result.isFinal) {
          committedRef.push(piece);
          handlers.onFinalSegment(piece);
        } else {
          interim = interim ? `${interim} ${piece}` : piece;
        }
      }
      partial = interim;
      emitPartial();
    };

    rec.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      handlers.onError?.(event.error ?? "Speech recognition failed.");
    };

    rec.onend = () => {
      if (!active) return;
      // Chrome ends sessions often even with continuous=true — restart while mic is held.
      try {
        rec.start();
      } catch {
        setTimeout(() => {
          if (!active) return;
          try {
            const next = new Ctor();
            next.continuous = true;
            next.interimResults = true;
            next.lang = lang;
            bindRecognition(next);
            next.start();
            recognition = next;
          } catch {
            /* ignore */
          }
        }, 100);
      }
    };
  };

  const startRecognition = (): SpeechRecognition | null => {
    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = lang;
      bindRecognition(rec);
      rec.start();
      return rec;
    } catch {
      return null;
    }
  };

  recognition = startRecognition();
  if (!recognition) return null;

  return {
    stop: () => {
      active = false;
      try {
        recognition?.stop();
      } catch {
        /* ignore */
      }
      const tail = partial.trim();
      if (tail) committedRef.push(tail);
      partial = "";
      return committedRef.join(" ").trim();
    },
    abort: () => {
      active = false;
      try {
        recognition?.abort();
      } catch {
        /* ignore */
      }
      committedRef.length = 0;
      partial = "";
    },
  };
}
