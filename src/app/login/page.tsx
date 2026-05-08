"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-6 shadow-2xl">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-indigo-300">
          Pathfinder
        </p>
        <h1 className="text-2xl font-semibold text-white">
          {mode === "signin" ? "Welcome back" : "Set up your account"}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {mode === "signin"
            ? "Sign in to continue."
            : "Set up an account to start tracking goals."}
        </p>

        <div className="mt-5 grid grid-cols-2 rounded-xl border border-white/10 bg-zinc-950/60 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm transition ${
              mode === "signin"
                ? "bg-indigo-500 text-white"
                : "text-zinc-300 hover:text-white"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm transition ${
              mode === "signup"
                ? "bg-indigo-500 text-white"
                : "text-zinc-300 hover:text-white"
            }`}
          >
            Set up account
          </button>
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setIsSubmitting(true);

            const formData = new FormData(event.currentTarget);
            const email = String(formData.get("email") ?? "");
            const password = String(formData.get("password") ?? "");
            const name = String(formData.get("name") ?? "");

            try {
              if (mode === "signup") {
                const response = await fetch("/api/auth/register", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name,
                    email,
                    password,
                  }),
                });

                const result = (await response.json()) as { error?: string };

                if (!response.ok) {
                  setError(result.error ?? "Could not set up account.");
                  setIsSubmitting(false);
                  return;
                }
              }

              const signInResult = await signIn("credentials", {
                email,
                password,
                redirect: false,
              });

              if (signInResult?.error) {
                setError("Invalid email or password.");
                setIsSubmitting(false);
                return;
              }

              router.push("/dashboard");
              router.refresh();
            } catch {
              setError("Something went wrong. Please try again.");
              setIsSubmitting(false);
            }
          }}
        >
          {mode === "signup" ? (
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm text-zinc-300">
                Full name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Jane Doe"
                required={mode === "signup"}
                className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none ring-indigo-500/40 transition focus:ring"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm text-zinc-300">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none ring-indigo-500/40 transition focus:ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm text-zinc-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="********"
              required
              className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none ring-indigo-500/40 transition focus:ring"
            />
          </div>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {isSubmitting
              ? "Please wait..."
              : mode === "signin"
                ? "Sign in"
                : "Set up account"}
          </button>
        </form>
      </section>
    </main>
  );
}
