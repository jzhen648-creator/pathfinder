import type { CSSProperties, ReactNode } from "react";
import { getServerSession } from "next-auth";
import { AppTopBar } from "@/components/nav/AppTopBar";
import { authOptions } from "@/lib/auth";
import { requireOnboardingComplete } from "@/lib/onboarding-gate";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireOnboardingComplete();

  const session = await getServerSession(authOptions);

  return (
    <div
      className="flex min-h-dvh flex-col bg-[#07060a] text-white"
      style={
        {
          "--pf-app-topbar-height": "52px",
          "--pf-app-content-height": "calc(100dvh - var(--pf-app-topbar-height))",
        } as CSSProperties
      }
    >
      <AppTopBar
        user={{
          name: session?.user?.name ?? null,
          email: session?.user?.email ?? null,
        }}
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
