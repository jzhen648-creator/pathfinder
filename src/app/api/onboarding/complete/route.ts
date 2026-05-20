import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { completeOnboardingForUser } from "@/lib/complete-onboarding";
import { prisma } from "@/lib/prisma";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";

const LIFE_AREA_ENUM = z.enum(LIFE_AREA_IDS);

const confirmSchema = z.object({
  name: z.string().min(1, "Name is required."),
  activeLimbIds: z.array(LIFE_AREA_ENUM).min(2, "Select at least 2 areas."),
  confirm: z.literal(true),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid onboarding payload" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await completeOnboardingForUser(prisma, userId, {
      name: parsed.data.name,
      activeLimbIds: parsed.data.activeLimbIds,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[onboarding/complete]", error);
    const message =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : "Failed to complete onboarding";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
