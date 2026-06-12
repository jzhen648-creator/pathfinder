import { getServerSession } from "next-auth";

import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

import { prisma } from "@/lib/prisma";

import { WEB_HOME_PATH } from "@/lib/web-landing";

/** Server components: redirect unauthenticated users; production sends incomplete onboarding to web home. */
export async function requireOnboardingComplete(): Promise<void> {
  const session = await getServerSession(authOptions);

  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompleted: true },
  });

  if (!user) {
    redirect("/login");
  }

  if (!user.onboardingCompleted) {
    redirect(WEB_HOME_PATH);
  }
}

/** Default landing path after auth (e.g. home, post-login). */
export async function defaultAppPathForSession(): Promise<string> {
  const session = await getServerSession(authOptions);

  const userId = session?.user?.id;

  if (!userId) return "/login";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompleted: true },
  });

  if (!user) return "/login";

  return WEB_HOME_PATH;
}
