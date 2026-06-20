import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureTaxonomyCurrent } from "@/lib/taxonomy-sync";
import { unlockThemesForUser } from "@/lib/unlocked-themes";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";

const bodySchema = z.object({
  limbIds: z.array(z.enum(LIFE_AREA_IDS)).min(1),
  /** Phase C alias — same values as `limbIds`. */
  themeIds: z.array(z.enum(LIFE_AREA_IDS)).min(1).optional(),
});

/** Unlock life themes for map visibility (canonical route). */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const themeIds = parsed.data.themeIds ?? parsed.data.limbIds;
  await ensureTaxonomyCurrent(prisma, userId);
  const unlockedThemeIds = await unlockThemesForUser(prisma, userId, themeIds);
  return NextResponse.json({ unlockedThemeIds, unlockedLimbIds: unlockedThemeIds });
}
