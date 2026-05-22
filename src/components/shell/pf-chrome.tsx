"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMapIssuesCount } from "@/contexts/map-issues-count-context";
import { loadMapData } from "@/lib/load-map-data";

export type PfChromeShell = "roadmap" | "nextSteps";

export function PfChromeTopbar(_props: {
  shell: PfChromeShell;
  avatarInitials: string;
  avatarLoading?: boolean;
  avatarTitle: string;
}) {
  // The authenticated route-group layout renders the unified AppTopBar.
  return null;
}

function issuesNavLabel(count: number | null): string {
  if (count != null && count > 0) return `Issues · ${count}`;
  return "Issues";
}

export function PfChromeViewsNav({ shell }: { shell: PfChromeShell }) {
  const pathname = usePathname();
  const { count, setCount } = useMapIssuesCount();
  const prefetchStarted = useRef(false);

  useEffect(() => {
    if (prefetchStarted.current) return;
    if (count != null) return;
    const skip =
      pathname === "/login" ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/onboarding");
    if (skip) return;
    prefetchStarted.current = true;
    void loadMapData().then((result) => {
      if (result.ok) setCount(result.issues.total);
    });
  }, [count, pathname, setCount]);

  const activeHref = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const ns = shell === "nextSteps";
  const ink100 = ns ? "var(--ns-ink100,#ECEEF0)" : "var(--rm-ink100,#ECEEF0)";
  const text1 = ns ? "var(--ns-text1,#1A1C1E)" : "var(--rm-text1,#1A1C1E)";
  const text3 = ns ? "var(--ns-text3,#6B7280)" : "var(--rm-text3,#6B7280)";

  const linkClass = (href: string) =>
    [
      "mb-0.5 flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] transition-colors",
      activeHref(href) ? "font-medium" : "",
    ].join(" ");

  const linkStyle = (href: string): CSSProperties => {
    const on = activeHref(href);
    return {
      background: on ? ink100 : "transparent",
      color: on ? text1 : text3,
    };
  };

  const issuesLabel = issuesNavLabel(count);

  return (
    <nav className="px-2 pb-1 pt-2" data-shell={shell}>
      <Link
        href="/tree"
        className={linkClass("/tree")}
        style={linkStyle("/tree")}
        onMouseEnter={(e) => {
          if (!activeHref("/tree")) (e.currentTarget as HTMLAnchorElement).style.background = ink100;
        }}
        onMouseLeave={(e) => {
          if (!activeHref("/tree")) (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
        }}
      >
        <span className="opacity-70" aria-hidden>
          🌳
        </span>
        Tree
      </Link>
      <Link
        href="/roadmap"
        className={linkClass("/roadmap")}
        style={linkStyle("/roadmap")}
        onMouseEnter={(e) => {
          if (!activeHref("/roadmap")) (e.currentTarget as HTMLAnchorElement).style.background = ink100;
        }}
        onMouseLeave={(e) => {
          if (!activeHref("/roadmap")) (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
        }}
      >
        <span className="opacity-70" aria-hidden>
          ⌁
        </span>
        Roadmap
      </Link>
      <Link
        href="/next-steps"
        className={linkClass("/next-steps")}
        style={linkStyle("/next-steps")}
        onMouseEnter={(e) => {
          if (!activeHref("/next-steps")) (e.currentTarget as HTMLAnchorElement).style.background = ink100;
        }}
        onMouseLeave={(e) => {
          if (!activeHref("/next-steps")) (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
        }}
      >
        <span className="opacity-70" aria-hidden>
          ≡
        </span>
        Next Steps
      </Link>
      <Link
        href="/issues"
        className={linkClass("/issues")}
        style={linkStyle("/issues")}
        data-testid="nav-issues"
        onMouseEnter={(e) => {
          if (!activeHref("/issues")) (e.currentTarget as HTMLAnchorElement).style.background = ink100;
        }}
        onMouseLeave={(e) => {
          if (!activeHref("/issues")) (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
        }}
      >
        <span className="opacity-70" aria-hidden>
          !
        </span>
        {issuesLabel}
      </Link>
    </nav>
  );
}
