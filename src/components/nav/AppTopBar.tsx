"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu, type AccountMenuUser } from "@/components/nav/AccountMenu";
import { useMapIssuesCount } from "@/contexts/map-issues-count-context";

type AppTopBarVariant = "dark" | "light";

const SURFACES = [
  { label: "Map", href: "/tree", match: ["/tree"] },
  { label: "Tasks", href: "/tasks", match: ["/tasks", "/next-steps"] },
  { label: "Review", href: "/issues", match: ["/issues"] },
] as const;

function isActive(pathname: string, matchers: readonly string[]): boolean {
  return matchers.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

export function AppTopBar({
  user,
  variant,
}: {
  user: AccountMenuUser;
  variant?: AppTopBarVariant;
}) {
  const pathname = usePathname();
  const { count: mapIssuesCount } = useMapIssuesCount();
  const resolvedVariant = variant ?? "dark";
  const isLight = resolvedVariant === "light";

  return (
    <header
      className={[
        "z-900 grid h-(--pf-app-topbar-height) shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-4 sm:px-5",
        isLight
          ? "border-zinc-200 bg-white text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
          : "border-white/10 bg-[#07060a]/92 text-white backdrop-blur-xl",
      ].join(" ")}
      data-app-topbar-variant={resolvedVariant}
    >
      <Link href="/tree" className="justify-self-start text-[15px] font-semibold tracking-[-0.01em] no-underline">
        Pathfinder
      </Link>

      <nav
        aria-label="Primary surfaces"
        className={[
          "flex items-center gap-1 rounded-full border p-1",
          isLight
            ? "border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
            : "border-white/10 bg-white/4 text-white/55",
        ].join(" ")}
      >
        {SURFACES.map((surface) => {
          const active = isActive(pathname, surface.match);
          const showIssuesCount = surface.href === "/issues" && mapIssuesCount != null && mapIssuesCount > 0;
          return (
            <Link
              key={surface.href}
              href={surface.href}
              aria-current={active ? "page" : undefined}
              className={[
                "inline-flex items-center rounded-full px-3 py-1.5 text-[12px] font-medium leading-none no-underline transition",
                active
                  ? isLight
                    ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "bg-white/14 text-white"
                  : isLight
                    ? "hover:bg-white/80 hover:text-zinc-800 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100"
                    : "hover:bg-white/8 hover:text-white/85",
              ].join(" ")}
            >
              <span>{surface.label}</span>
              {showIssuesCount ? (
                <span
                  className={[
                    "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                    isLight
                      ? active
                        ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"
                        : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                      : active
                        ? "bg-white/18 text-white"
                        : "bg-white/10 text-white/80",
                  ].join(" ")}
                >
                  {mapIssuesCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="justify-self-end">
        <AccountMenu user={user} variant={resolvedVariant} />
      </div>
    </header>
  );
}
