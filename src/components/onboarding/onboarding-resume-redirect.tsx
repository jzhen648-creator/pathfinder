"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/** DB says onboarding is done but the JWT may be stale — refresh session then go to the tree. */
export function OnboardingResumeRedirect() {
  const router = useRouter();
  const { update: refreshSession } = useSession();

  useEffect(() => {
    void (async () => {
      await refreshSession();
      router.replace("/tree");
      router.refresh();
    })();
  }, [refreshSession, router]);

  return (
    <p className="text-center text-sm text-zinc-400">Taking you to your tree…</p>
  );
}
