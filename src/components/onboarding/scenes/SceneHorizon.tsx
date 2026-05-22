"use client";

type SceneHorizonProps = {
  onComplete: () => void;
  pending: boolean;
};

export function SceneHorizon({ onComplete, pending }: SceneHorizonProps) {
  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-[#151515] p-6">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-[#EF9F27]">Scene 6 / 6</p>
        <h1 className="text-3xl font-semibold text-white">Done</h1>
        <p className="text-sm text-zinc-400">Horizon placeholder. The map with one pursuit appears here later.</p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={onComplete}
        className="w-full rounded-xl bg-[#EF9F27] px-4 py-3 text-sm font-semibold text-[#07060A] transition hover:bg-[#f5b34d] disabled:opacity-50"
      >
        Finish onboarding
      </button>
    </section>
  );
}
