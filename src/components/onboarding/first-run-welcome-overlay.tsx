"use client";

type FirstRunWelcomeOverlayProps = {
  userName?: string | null;
  onStart: () => void;
};

export function FirstRunWelcomeOverlay({ userName, onStart }: FirstRunWelcomeOverlayProps) {
  const greeting = userName?.trim() ? `Hi ${userName.trim()}` : "Welcome";

  return (
    <div
      className="fixed inset-0 z-150 flex items-center justify-center bg-black/75 px-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-welcome-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[#EF9F27]/20 bg-[#141218] p-6 shadow-2xl shadow-black/50"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p
          className="text-xs uppercase tracking-[0.2em] text-[#EF9F27]"
          style={{ fontFamily: "var(--font-pf-roadmap-sans), 'DM Sans', sans-serif" }}
        >
          Pathfinder
        </p>
        <h1
          id="first-run-welcome-title"
          className="mt-2 text-2xl font-semibold text-white"
          style={{ fontFamily: "var(--font-pf-roadmap-serif), Lora, Georgia, serif" }}
        >
          {greeting}
        </h1>
        <p
          className="mt-4 text-base leading-relaxed text-zinc-300"
          style={{ fontFamily: "var(--font-pf-roadmap-sans), 'DM Sans', sans-serif" }}
        >
          Talk freely about your life. I&apos;ll turn it into a map.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="relative mt-8 w-full overflow-hidden rounded-xl bg-[#EF9F27] px-4 py-3 text-sm font-semibold text-[#07060A] shadow-[0_0_28px_rgba(239,159,39,0.22)] transition hover:bg-[#f5b34d] hover:shadow-[0_0_36px_rgba(239,159,39,0.35)] focus:outline-none focus:ring-2 focus:ring-[#EF9F27]/60 focus:ring-offset-2 focus:ring-offset-[#141218]"
          style={{ fontFamily: "var(--font-pf-roadmap-sans), 'DM Sans', sans-serif" }}
        >
          <span className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.32),transparent_58%)] opacity-40" />
          <span className="relative">Start your map</span>
        </button>
      </div>
    </div>
  );
}
