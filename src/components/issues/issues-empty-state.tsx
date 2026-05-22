export function IssuesEmptyState() {
  return (
    <div className="ns-empty-card">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: "var(--ns-ink100)" }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden
          style={{ color: "var(--ns-text3)" }}
        >
          <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M5.5 9.3l2.3 2.3 4.8-5.1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div>
        <div className="text-[13px] text-(--ns-text3)">Everything looks good</div>
        <div className="mt-1 text-[12px] text-(--ns-text3) opacity-70">
          Your map has no checks that need review.
        </div>
      </div>
    </div>
  );
}
