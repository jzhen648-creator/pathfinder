"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

type AccountMenuVariant = "dark" | "light";

export type AccountMenuUser = {
  name?: string | null;
  email?: string | null;
};

function initialsForUser(user: AccountMenuUser): string {
  const name = user.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  const local = user.email?.split("@")[0]?.trim();
  if (local) return local.slice(0, 2).toUpperCase();
  return "PF";
}

export function AccountMenu({
  user,
  variant = "dark",
  loading = false,
}: {
  user: AccountMenuUser;
  variant?: AccountMenuVariant;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initials = initialsForUser(user);
  const isLight = variant === "light";
  const displayName = user.name?.trim() || "Pathfinder account";
  const email = user.email?.trim() || "No email on file";

  async function deleteAccount() {
    const confirmed = window.confirm(
      "This will permanently delete your map and all your data. This cannot be undone.",
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) {
        window.alert("Could not delete your account right now. Please try again.");
        setDeleting(false);
        return;
      }
      await signOut({ callbackUrl: "/login" });
    } catch {
      window.alert("Could not delete your account right now. Please try again.");
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex size-[32px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition",
          isLight
            ? "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            : "border border-white/15 bg-white/10 text-white hover:bg-white/15",
        ].join(" ")}
        style={{ opacity: loading ? 0.45 : 1 }}
        title={displayName || email}
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          className={[
            "absolute right-0 top-[calc(100%+8px)] z-1000 w-64 overflow-hidden rounded-2xl border p-1 text-left shadow-2xl",
            isLight
              ? "border-zinc-200 bg-white text-zinc-950 shadow-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              : "border-white/10 bg-[#111015]/95 text-white shadow-black/40 backdrop-blur-xl",
          ].join(" ")}
        >
          <div className={["px-3 py-2.5", isLight ? "text-zinc-950 dark:text-zinc-50" : "text-white"].join(" ")}>
            <div className="truncate text-[13px] font-medium">{displayName}</div>
            <div className={["mt-0.5 truncate text-[12px]", isLight ? "text-zinc-500" : "text-white/50"].join(" ")}>
              {email}
            </div>
          </div>

          <div className={["my-1 h-px", isLight ? "bg-zinc-200 dark:bg-zinc-700" : "bg-white/10"].join(" ")} />

          <div
            role="menuitem"
            aria-disabled="true"
            className={["rounded-xl px-3 py-2 text-[13px]", isLight ? "text-zinc-400" : "text-white/35"].join(" ")}
          >
            Settings coming soon
          </div>

          {process.env.NODE_ENV === "development" ? (
            <div
              role="menuitem"
              aria-disabled="true"
              className={["rounded-xl px-3 py-2 text-[13px]", isLight ? "text-zinc-500" : "text-white/50"].join(" ")}
            >
              Switch account in DevPanel
            </div>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className={[
              "w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium transition",
              isLight
                ? "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                : "text-white/80 hover:bg-white/10",
            ].join(" ")}
            onClick={() => {
              window.dispatchEvent(new CustomEvent("pathfinder:export-tree-pdf"));
              setOpen(false);
            }}
          >
            Export PDF
          </button>

          <button
            type="button"
            role="menuitem"
            className={[
              "w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium transition",
              isLight
                ? "text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                : "text-red-200 hover:bg-red-500/15",
            ].join(" ")}
            onClick={() => void signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={deleting}
            className={[
              "w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium transition disabled:opacity-60",
              isLight
                ? "text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                : "text-red-300 hover:bg-red-500/15",
            ].join(" ")}
            onClick={() => void deleteAccount()}
          >
            {deleting ? "Deleting account..." : "Delete account"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
