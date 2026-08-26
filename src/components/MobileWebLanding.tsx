import Link from "next/link";

/** Public production home — API backend only; the app lives on mobile. */
export function MobileWebLanding() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-[#0C0B10] px-6 py-16 text-[#F3EFE6]">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-3">
          <p className="text-sm font-medium tracking-[0.2em] text-[#818cf8] uppercase">
            Almanac
          </p>
          <h1 className="font-serif text-3xl leading-tight tracking-tight">
            Your enduring life context, kept clearly
          </h1>
          <p className="text-base leading-relaxed text-[rgba(243,239,230,0.78)]">
            Almanac keeps the Updates you deliberately accept from AI conversations in a
            source-backed history. The active product lives in the iOS app.
          </p>
        </div>

        <div className="rounded-2xl border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-5 py-4 text-left text-sm leading-relaxed text-[rgba(243,239,230,0.78)]">
          <p className="font-medium text-[#F3EFE6]">Developers</p>
          <p className="mt-2">
            The iOS client authenticates with{" "}
            <code className="text-[#EF9F27]">POST /api/auth/mobile-login</code> and call{" "}
            <code className="text-[#EF9F27]">/api/almanac</code> with a Bearer token. This site is
            the supporting API, not a second Almanac product.
          </p>
        </div>

        <p className="text-sm text-[rgba(243,239,230,0.52)]">
          Need to reset a password?{" "}
          <Link href="/login" className="text-[#EF9F27] underline-offset-2 hover:underline">
            Sign in on the web
          </Link>
        </p>
      </div>
    </main>
  );
}
