"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { milestoneDoneForSemantics } from "@/lib/milestone-semantics";

type GoalSnapshot = {
  id: string;
  title: string;
  description: string;
  lifeArea: string;
  deadline: string | null;
  milestones: Array<{
    id: string;
    title: string;
    completedAt?: string | Date | null;
    subtasks: Array<{ id: string; title: string; isCompleted: boolean }>;
  }>;
};

type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

export function GoalCardActions({ goal }: { goal: GoalSnapshot }) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeMilestone = useMemo(
    () =>
      goal.milestones.find(
        (m) =>
          !milestoneDoneForSemantics({
            completedAt: m.completedAt ?? null,
            subtasks: m.subtasks.map((s) => ({
              isCompleted: s.isCompleted,
              title: s.title,
            })),
          }),
      ) ?? goal.milestones[goal.milestones.length - 1],
    [goal.milestones],
  );

  function openEdit() {
    const summary = `Current pursuit:
- Title: ${goal.title}
- Theme: ${goal.lifeArea}
- Deadline: ${goal.deadline}
- Description: ${goal.description}
- Active milestone: ${activeMilestone?.title ?? "None"}

What would you like to change? You can update title, description, deadline, theme, or ask me to fully regenerate milestones.`;
    setMessages([{ id: crypto.randomUUID(), role: "assistant", text: summary }]);
    setInput("");
    setError(null);
    setIsEditOpen(true);
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      "Remove this pursuit from your map? It will be archived (hidden from the tree).",
    );
    if (!confirmed) return;
    const response = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
    if (!response.ok) return;
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={openEdit}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 transition hover:border-indigo-300/50 hover:text-indigo-200"
          title="Edit pursuit"
        >
          ✎
        </button>
        <button
          onClick={() => void handleDelete()}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 transition hover:border-rose-300/50 hover:text-rose-200"
          title="Remove from map"
        >
          🗑
        </button>
      </div>

      {isEditOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#141414] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Edit pursuit</h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="rounded-md px-2 py-1 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>
            <div className="flex h-[390px] flex-col rounded-xl border border-white/10 bg-[#101010]">
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-6 ${
                        message.role === "assistant"
                          ? "border border-indigo-400/20 bg-indigo-500/10 text-zinc-100"
                          : "border border-white/10 bg-[#161616] text-zinc-200"
                      }`}
                    >
                      {message.text}
                    </div>
                  </div>
                ))}
                {error ? <p className="text-sm text-rose-400">{error}</p> : null}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = input.trim();
                  if (!value) return;
                  setMessages((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), role: "user", text: value },
                  ]);
                  setInput("");
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      text: "Got it. Anything else to change? When you're ready, click Apply Changes.",
                    },
                  ]);
                }}
                className="border-t border-white/10 p-4"
              >
                <div className="flex items-end gap-2">
                  <input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Describe the change you want..."
                    className="flex-1 rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 transition focus:ring"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
                  >
                    Send
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-zinc-500">
                    Ask to update fields or say &quot;regenerate milestones&quot;.
                  </p>
                  <button
                    type="button"
                    disabled={isSubmitting || !messages.some((m) => m.role === "user")}
                    onClick={async () => {
                      setError(null);
                      setIsSubmitting(true);
                      try {
                        const response = await fetch(`/api/goals/${goal.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            conversation: messages
                              .filter((m) => m.role === "user")
                              .map((m) => m.text),
                          }),
                        });
                        const data = (await response.json()) as { error?: string };
                        if (!response.ok) {
                          setError(data.error ?? "Could not update this pursuit.");
                          setIsSubmitting(false);
                          return;
                        }
                        setIsEditOpen(false);
                        router.refresh();
                      } catch {
                        setError("Could not update this pursuit.");
                        setIsSubmitting(false);
                      }
                    }}
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
                  >
                    {isSubmitting ? "Applying..." : "Apply Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
