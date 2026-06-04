import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activateHubForUser } from "@/lib/system-hubs";
import { isLifeAreaId, mergeUnlockedLimbIds, parseUnlockedLimbIds } from "@/lib/unlocked-themes";

const bodySchema = z.object({
  branchId: z.string().min(1),
});

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

  const branch = await prisma.branch.findFirst({
    where: { id: parsed.data.branchId, userId, parentBranchId: null },
    select: { id: true, limbId: true },
  });
  if (!branch) {
    return NextResponse.json({ error: "Hub not found." }, { status: 404 });
  }

  const [user, roots] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { unlockedLimbIds: true },
    }),
    prisma.branch.findMany({
      where: { userId, parentBranchId: null },
      select: { limbId: true, parentBranchId: true, isActive: true },
    }),
  ]);
  const unlocked = mergeUnlockedLimbIds(parseUnlockedLimbIds(user?.unlockedLimbIds), roots);
  if (!isLifeAreaId(branch.limbId) || !unlocked.includes(branch.limbId)) {
    return NextResponse.json({ error: "Unlock this theme on your map first." }, { status: 400 });
  }

  const activated = await activateHubForUser(prisma, userId, branch.id);
  return NextResponse.json({ activated: activated ? 1 : 0 });
}
