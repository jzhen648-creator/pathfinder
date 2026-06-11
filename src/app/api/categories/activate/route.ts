import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activateCategoryForUser } from "@/lib/system-categories";
import { isLifeAreaId, mergeUnlockedLimbIds, parseUnlockedLimbIds } from "@/lib/unlocked-themes";

const bodySchema = z.object({
  categoryId: z.string().min(1),
});

/** Activate a single taxonomy category row (legacy: activate-hub). */
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

  const category = await prisma.themeCategory.findFirst({
    where: { id: parsed.data.categoryId, userId, parentCategoryId: null },
    select: { id: true, themeId: true },
  });
  if (!category) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }

  const [user, roots] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { unlockedLimbIds: true },
    }),
    prisma.themeCategory.findMany({
      where: { userId, parentCategoryId: null },
      select: { themeId: true, parentCategoryId: true, isActive: true },
    }),
  ]);
  const unlocked = mergeUnlockedLimbIds(parseUnlockedLimbIds(user?.unlockedLimbIds), roots);
  if (!isLifeAreaId(category.themeId) || !unlocked.includes(category.themeId)) {
    return NextResponse.json({ error: "Unlock this theme on your map first." }, { status: 400 });
  }

  const activated = await activateCategoryForUser(prisma, userId, category.id);
  return NextResponse.json({ activated: activated ? 1 : 0 });
}
