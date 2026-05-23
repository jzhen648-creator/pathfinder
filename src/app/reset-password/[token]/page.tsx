"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not reset password.");
        setIsSubmitting(false);
        return;
      }
      setSuccess(true);
      window.setTimeout(() => router.push("/login"), 900);
    } catch {
      setError("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-6 shadow-2xl">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-indigo-300">Pathfinder</p>
        <h1 className="text-2xl font-semibold text-white">Reset your password</h1>
        <p className="mt-2 text-sm text-zinc-400">Choose a new password for your account.</p>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm text-zinc-300">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
              className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none ring-indigo-500/40 transition focus:ring"
            />
          </div>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-400">Password updated. Redirecting...</p> : null}

          <button
            type="submit"
            disabled={isSubmitting || success}
            className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {isSubmitting ? "Please wait..." : "Reset password"}
          </button>
        </form>
      </section>
    </main>
  );
}
