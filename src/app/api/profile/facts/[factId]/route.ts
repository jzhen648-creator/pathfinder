import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  normalizeProfileFactKey,
  profileFactCategorySchema,
  serializeProfileFact,
} from "@/lib/profile-memory";

const updateFactSchema = z.object({
  category: profileFactCategorySchema.optional(),
  key: z.string().trim().min(1).max(80).optional(),
  value: z.string().trim().min(1).max(500).optional(),
});

type RouteContext = {
  params: Promise<{ factId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { factId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = updateFactSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.profileFact.findFirst({
    where: { id: factId, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Fact not found" }, { status: 404 });
  }

  const category = parsed.data.category ?? existing.category;
  const value = parsed.data.value ?? existing.value;
  const key = normalizeProfileFactKey(parsed.data.key ?? (parsed.data.category ? value : existing.key));

  try {
    const fact = await prisma.profileFact.update({
      where: { id: factId },
      data: {
        category,
        key,
        value,
        confidence: existing.source === "user_manual" ? null : existing.confidence,
      },
    });
    return NextResponse.json({ fact: serializeProfileFact(fact) });
  } catch (err) {
    console.error("[PATCH /api/profile/facts/[factId]] failed", err);
    return NextResponse.json({ error: "Could not update fact" }, { status: 409 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { factId } = await context.params;
  const existing = await prisma.profileFact.findFirst({
    where: { id: factId, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Fact not found" }, { status: 404 });
  }

  await prisma.profileFact.delete({ where: { id: factId } });
  return NextResponse.json({ ok: true });
}
