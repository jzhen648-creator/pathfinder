import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureHubTaxonomyCurrent } from "@/lib/hub-taxonomy-sync";
import {
  requireAuthSecret,
  signMobileSessionJwt,
  type MobileAuthResponse,
} from "@/lib/mobile-auth";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

/**
 * Mobile-only register. Mirrors `/api/auth/register` but returns a session JWT
 * on success so the mobile client can sign the user straight in (no follow-up
 * login round-trip).
 */
export async function POST(request: Request) {
  const secret = requireAuthSecret();
  if (typeof secret !== "string") {
    return NextResponse.json({ error: secret.error }, { status: secret.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      onboardingCompleted: false,
      firstRunCompleted: false,
    },
  });

  await ensureHubTaxonomyCurrent(prisma, user.id);

  const token = await signMobileSessionJwt(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      onboardingCompleted: user.onboardingCompleted,
      firstRunCompleted: user.firstRunCompleted,
    },
    secret,
  );

  const response: MobileAuthResponse = {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      onboardingCompleted: user.onboardingCompleted,
      firstRunCompleted: user.firstRunCompleted,
    },
  };

  return NextResponse.json(response);
}
