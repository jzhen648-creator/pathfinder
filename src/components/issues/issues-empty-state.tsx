export function IssuesEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className="mb-3 opacity-40"
        style={{ color: "var(--rm-text3, #6B7280)" }}
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M7.5 12.5l3 3 6-6.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-[15px] text-(--rm-text2)">Everything looks good</p>
    </div>
  );
}
