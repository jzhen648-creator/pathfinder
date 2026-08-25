import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** Almanac persisted dogfood intentionally excludes anonymous guest accounts. */
export async function requireAlmanacDogfoodUser(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth;
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, isAnonymous: true },
  });
  if (!user || user.isAnonymous) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sign in to use Almanac dogfood." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, userId: user.id };
}
