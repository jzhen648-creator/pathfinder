"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { onboardingQuestions, type OnboardingAnswers } from "@/lib/onboarding";

type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

export function OnboardingChat({ userName }: { userName: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "conversation" | "freeText">("choose");
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");
  const [aboutMeText, setAboutMeText] = useState("");
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      text: `Hi ${userName || "there"} — glad you’re here. Before anything else, ${onboardingQuestions[0].question}`,
    },
  ]);
  const [profileText, setProfileText] = useState("");
  const [editableProfile, setEditableProfile] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isProfileStep = step >= onboardingQuestions.length;

  const currentQuestion = onboardingQuestions[Math.min(step, onboardingQuestions.length - 1)];

  async function transcribeAudio(blob: Blob) {
    const formData = new FormData();
    formData.append("audio", new File([blob], "voice.webm", { type: blob.type || "audio/webm" }));
    const response = await fetch("/api/transcribe", { method: "POST", body: formData });
    const data = (await response.json()) as { text?: string; error?: string };
    if (!response.ok || !data.text) {
      throw new Error(data.error ?? "Transcription failed");
    }
    return data.text.trim();
  }

  async function handleVoiceClick() {
    setError(null);
    if (recording && mediaRecorder) {
      mediaRecorder.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        try {
          const text = await transcribeAudio(new Blob(chunks, { type: "audio/webm" }));
          if (text) {
            if (mode === "freeText") {
              setAboutMeText((prev) => (prev ? `${prev}\n${text}` : text));
              return;
            }
            setInput(text);
            setTimeout(() => {
              const form = document.getElementById("onboarding-chat-form");
              form?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
            }, 60);
          }
        } catch {
          setError("Could not transcribe voice input. You can continue with text.");
        }
      };
      setMediaRecorder(recorder);
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access denied. Please allow access or type your answer.");
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-[#141414] p-6">
      <h1 className="text-2xl font-semibold text-white">Personal Onboarding</h1>
      <p className="mt-2 text-sm text-zinc-400">A few quick questions, then your personalized profile.</p>

      <div className="mt-5 h-[460px] space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-[#101010] p-4">
        {mode === "choose" ? (
          <div className="space-y-3">
            <button
              onClick={() => setMode("conversation")}
              className="w-full rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-4 text-left transition hover:border-indigo-400/60 hover:bg-indigo-500/15"
            >
              <p className="text-sm font-semibold text-indigo-200">Let&apos;s have a conversation</p>
              <p className="mt-1 text-sm text-zinc-400">
                Guided 5-question flow (about 2 minutes).
              </p>
            </button>
            <button
              onClick={() => setMode("freeText")}
              className="w-full rounded-xl border border-white/10 bg-[#151515] p-4 text-left transition hover:border-indigo-400/40"
            >
              <p className="text-sm font-semibold text-zinc-200">I&apos;ll tell you about myself</p>
              <p className="mt-1 text-sm text-zinc-400">
                Write freely in one message and we&apos;ll generate your profile.
              </p>
            </button>
          </div>
        ) : null}

        {mode === "freeText" && !profileText ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-300">
              Share as much or as little as you want. Include anything relevant about your identity,
              moments, constraints, and what success means to you.
            </p>
            <textarea
              value={aboutMeText}
              onChange={(event) => setAboutMeText(event.target.value)}
              rows={12}
              className="w-full rounded-lg border border-white/10 bg-[#111111] p-3 text-sm leading-6 text-zinc-200 outline-none ring-indigo-500/40 transition focus:ring"
              placeholder="Tell me about your life, moments, motivation, and current situation..."
            />
          </div>
        ) : null}

        {mode === "conversation" ? (
          <>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`animate-chat-fade-in flex ${
              message.role === "assistant" ? "justify-start" : "justify-end"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-6 ${
                message.role === "assistant"
                  ? "border border-indigo-400/25 bg-indigo-500/10 text-zinc-100"
                  : "border border-white/10 bg-[#171717] text-zinc-200"
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
          </>
        ) : null}

        {(isProfileStep || mode === "freeText") && profileText ? (
          <div className="animate-chat-fade-in rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.12em] text-indigo-300">Your Profile Draft</p>
            <textarea
              value={editableProfile}
              onChange={(event) => setEditableProfile(event.target.value)}
              rows={10}
              className="w-full rounded-lg border border-white/10 bg-[#111111] p-3 text-sm leading-6 text-zinc-200 outline-none ring-indigo-500/40 transition focus:ring"
            />
          </div>
        ) : null}

      </div>

      <div className="mt-4">
        {error ? <p className="mb-2 text-sm text-rose-400">{error}</p> : null}

        {((isProfileStep && mode === "conversation") || (mode === "freeText" && profileText)) ? (
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => {
                setMode("choose");
                setStep(0);
                setInput("");
                setAboutMeText("");
                setAnswers({});
                setProfileText("");
                setEditableProfile("");
                setError(null);
                setMessages([
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                      text: `No problem — let’s refine this together from the start. ${onboardingQuestions[0].question}`,
                  },
                ]);
              }}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-white/20"
            >
              Restart
            </button>
            <button
              disabled={isSaving}
              onClick={async () => {
                setError(null);
                setIsSaving(true);
                try {
                  const response = await fetch("/api/onboarding/complete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      answers:
                        mode === "freeText"
                          ? { aboutMe: aboutMeText }
                          : answers,
                      profileText: editableProfile,
                      confirm: true,
                    }),
                  });
                  const data = (await response.json()) as { error?: string };
                  if (!response.ok) {
                    setError(data.error ?? "Could not save profile.");
                    setIsSaving(false);
                    return;
                  }

                  router.push("/dashboard");
                  router.refresh();
                } catch {
                  setError("Could not save your onboarding profile.");
                  setIsSaving(false);
                }
              }}
              className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
            >
              {isSaving ? "Finishing onboarding..." : "Finish and Go to Dashboard"}
            </button>
          </div>
        ) : (
          mode === "freeText" ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMode("choose")}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-white/20"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!aboutMeText.trim() || isSaving}
                onClick={async () => {
                  setError(null);
                  setIsSaving(true);
                  try {
                    const response = await fetch("/api/onboarding/complete", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        answers: { aboutMe: aboutMeText.trim() },
                      }),
                    });
                    const data = (await response.json()) as { error?: string; profileText?: string };
                    if (!response.ok || !data.profileText) {
                      setError(data.error ?? "Could not generate profile.");
                      setIsSaving(false);
                      return;
                    }
                    setProfileText(data.profileText);
                    setEditableProfile(data.profileText);
                  } catch {
                    setError("Could not generate onboarding profile.");
                  } finally {
                    setIsSaving(false);
                  }
                }}
                className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {isSaving ? "Generating profile..." : "Generate Profile"}
              </button>
            </div>
          ) : (
          <form
            id="onboarding-chat-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const value = input.trim();
              if (!value) return;

              const question = onboardingQuestions[step];
              const nextAnswers = { ...answers, [question.key]: value };
              setAnswers(nextAnswers);
              setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: value }]);
              setInput("");

              const nextStep = step + 1;
              if (nextStep < onboardingQuestions.length) {
                const nextText = buildNaturalTransition({
                  stepIndex: step,
                  answer: value,
                  nextQuestion: onboardingQuestions[nextStep].question,
                  currentName: nextAnswers.name ?? userName,
                });
                setStep(nextStep);
                setMessages((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), role: "assistant", text: nextText },
                ]);
              } else {
                setStep(onboardingQuestions.length);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    text: "Thank you. I’ll now write your personal profile so every future recommendation is genuinely tailored to you.",
                  },
                ]);

                try {
                  const response = await fetch("/api/onboarding/complete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ answers: nextAnswers }),
                  });
                  const data = (await response.json()) as { error?: string; profileText?: string };
                  if (!response.ok || !data.profileText) {
                    setError(data.error ?? "Could not generate profile.");
                    return;
                  }
                  setProfileText(data.profileText);
                  setEditableProfile(data.profileText);
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      text: "I drafted your profile below. Review and edit anything you want before confirming.",
                    },
                  ]);
                } catch {
                  setError("Could not generate onboarding profile.");
                }
              }
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs text-zinc-500">{currentQuestion.question}</label>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 transition focus:ring"
              />
            </div>
            <button
              type="button"
              onClick={handleVoiceClick}
              className={`relative rounded-lg border px-3 py-2 text-sm transition ${
                recording
                  ? "border-rose-400/60 bg-rose-500/10 text-rose-200"
                  : "border-white/10 text-zinc-300 hover:border-indigo-400/40"
              }`}
            >
              {recording ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                  Rec
                </span>
              ) : (
                "🎙"
              )}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
            >
              Send
            </button>
          </form>
          )
        )}
      </div>
    </section>
  );
}

function buildNaturalTransition({
  stepIndex,
  answer,
  nextQuestion,
  currentName,
}: {
  stepIndex: number;
  answer: string;
  nextQuestion: string;
  currentName: string;
}) {
  const clean = answer.trim();

  switch (stepIndex) {
    case 0: {
      const name = clean || currentName || "there";
      return `Nice to meet you, ${name}. ${nextQuestion}`;
    }
    case 1: {
      return `Thank you. ${nextQuestion}`;
    }
    case 2:
      return `Got it — thanks. ${nextQuestion}`;
    case 3:
      return `That helps me understand your current reality. ${nextQuestion}`;
    case 4:
      return `That’s a meaningful target. ${nextQuestion}`;
    default:
      return nextQuestion;
  }
}
