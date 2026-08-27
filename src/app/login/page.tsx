"use client";

import { useCallback, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

function safeCallbackPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("://") || raw === "/login" || raw.startsWith("/login/")) return null;
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const [forgot, setForgot] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submitCredentials = useCallback(async (nextEmail: string, nextPassword: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        email: nextEmail,
        password: nextPassword,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid email or password.");
        return;
      }
      const callback = safeCallbackPath(new URLSearchParams(window.location.search).get("callbackUrl"));
      router.push(callback ?? "/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FBF7F0] px-6 py-12 text-[#10221F]">
      <section className="w-full max-w-md space-y-8">
        <header className="space-y-3">
          <p className="font-serif text-xl">Almanac</p>
          <h1 className="font-serif text-4xl leading-tight">{forgot ? "Reset password" : "Welcome back"}</h1>
          <p className="max-w-sm text-sm leading-6 text-[#4F544F]">
            {forgot
              ? "Enter your invited-account email and we’ll send a reset link."
              : "Sign in to return to your source-backed Subject history."}
          </p>
        </header>

        <form
          method="post"
          className="space-y-5 rounded-2xl border border-[#C4B094]/70 bg-white p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setNotice(null);
            setIsSubmitting(true);
            try {
              if (forgot) {
                const response = await fetch("/api/auth/forgot-password", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });
                if (!response.ok) {
                  setError("Could not send a reset link right now.");
                } else {
                  setNotice("If that email exists, we’ll send a password reset link.");
                }
                return;
              }
              await submitCredentials(email, password);
            } catch {
              setError("Something went wrong. Please try again.");
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <label className="block space-y-2 text-sm font-medium">
            <span>Email</span>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="min-h-12 w-full rounded-xl border border-[#977E5B]/70 bg-[#FBF7F0] px-4 text-base outline-none ring-[#1F5E4D]/30 focus:ring"
            />
          </label>

          {!forgot ? (
            <label className="block space-y-2 text-sm font-medium">
              <span>Password</span>
              <input
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                className="min-h-12 w-full rounded-xl border border-[#977E5B]/70 bg-[#FBF7F0] px-4 text-base outline-none ring-[#1F5E4D]/30 focus:ring"
              />
            </label>
          ) : null}

          {error ? <p className="text-sm text-[#A94639]" role="alert">{error}</p> : null}
          {notice ? <p className="text-sm text-[#1F5E4D]" role="status">{notice}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-12 w-full rounded-xl bg-[#1F5E4D] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSubmitting ? "Please wait…" : forgot ? "Send reset link" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => {
              setForgot((current) => !current);
              setError(null);
              setNotice(null);
            }}
            className="min-h-11 w-full text-sm font-semibold text-[#1F5E4D]"
          >
            {forgot ? "Back to sign in" : "Forgot password?"}
          </button>

        </form>

        <p className="text-center text-xs leading-5 text-[#74756F]">
          Almanac currently uses invited accounts. The iOS app is the active product.
        </p>
      </section>
    </main>
  );
}
