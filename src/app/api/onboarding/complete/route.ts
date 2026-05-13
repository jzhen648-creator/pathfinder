import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateProfileFromAnswers } from "@/lib/onboarding";
import { ensureNewProfileBranches } from "@/lib/new-profile-tree-branches";

const payloadSchema = z.object({
  answers: z.record(z.string(), z.string().min(1)),
  profileText: z.string().optional(),
  confirm: z.boolean().optional(),
  // Prefer the new key; keep lifeWheelRatings for backward compatibility.
  lifeAreaRatings: z.record(z.string(), z.number()).optional(),
  lifeWheelRatings: z.record(z.string(), z.number()).optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid onboarding payload" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const profileText =
      parsed.data.profileText ??
      (await generateProfileFromAnswers({
      name: user.name ?? "User",
      answers: parsed.data.answers,
      }));

    if (parsed.data.confirm) {
      const lifeAreaRatings = parsed.data.lifeAreaRatings ?? parsed.data.lifeWheelRatings;
      const birthYearRaw = parsed.data.answers.birthYear;
      const parsedBirthYear = birthYearRaw ? Number.parseInt(birthYearRaw, 10) : NaN;
      const birthYear =
        Number.isFinite(parsedBirthYear) && parsedBirthYear >= 1900 && parsedBirthYear <= 2100
          ? parsedBirthYear
          : null;
      const birthPlace = parsed.data.answers.birthPlace?.trim() || null;
      const preferredName = parsed.data.answers.name?.trim();

      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(preferredName ? { name: preferredName } : {}),
          birthYear,
          birthPlace,
          onboardingCompleted: true,
          onboardingProfileText: profileText,
          onboardingProfileData: parsed.data.answers,
          lifeWheelRatings: lifeAreaRatings,
          lifeWheelHistory: lifeAreaRatings
            ? [
                {
                  timestamp: new Date().toISOString(),
                  ratings: lifeAreaRatings,
                },
              ]
            : undefined,
        },
      });

      await ensureNewProfileBranches(prisma, userId);
    }

    return NextResponse.json({ profileText });
  } catch {
    return NextResponse.json({ error: "Failed to complete onboarding" }, { status: 500 });
  }
}
