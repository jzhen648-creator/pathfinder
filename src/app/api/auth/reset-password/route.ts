import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid reset request." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashResetToken(parsed.data.token),
        passwordResetExpiry: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[reset-password]", error);
    return NextResponse.json(
      { error: "Could not reset password right now. Try again." },
      { status: 500 },
    );
  }
}
