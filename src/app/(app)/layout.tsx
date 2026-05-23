import type { CSSProperties, ReactNode } from "react";
import { getServerSession } from "next-auth";
import { AppTopBar } from "@/components/nav/AppTopBar";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { onboardingCompleted: true },
      })
    : null;

  const showTopBar = user?.onboardingCompleted !== false;

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-[#07060a] text-white"
      style={
        {
          "--pf-app-topbar-height": showTopBar ? "52px" : "0px",
          "--pf-app-content-height": showTopBar
            ? "calc(100dvh - var(--pf-app-topbar-height))"
            : "100dvh",
        } as CSSProperties
      }
    >
      {showTopBar ? (
        <AppTopBar
          user={{
            name: session?.user?.name ?? null,
            email: session?.user?.email ?? null,
          }}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
