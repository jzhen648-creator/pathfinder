import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { countPendingIncorporateForUser } from "@/lib/memory/update-memory";
import { serializeUserMemory, writeUserMemory } from "@/lib/memory/memory-write";
import { seedUserMemory } from "@/lib/memory/seed-memory";

const patchSchema = z.object({
  blob: z.string().max(4000),
});

export async function GET() {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  let row = await prisma.userMemory.findUnique({ where: { userId: auth.userId } });
  if (!row?.blob.trim() && !row?.lastUserEditedAt) {
    row = (await seedUserMemory(auth.userId)) ?? row;
  }

  if (!row?.blob.trim()) {
    const pendingIncorporateCount = row?.lastUserEditedAt
      ? await countPendingIncorporateForUser(auth.userId)
      : 0;
    return NextResponse.json({
      blob: "",
      version: row?.version ?? 0,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      lastUserEditedAt: row?.lastUserEditedAt?.toISOString() ?? null,
      isDirty: row?.isDirty ?? false,
      streamSessionCount: row?.streamSessionCount ?? 0,
      pendingIncorporateCount,
    });
  }

  const pendingIncorporateCount = row.lastUserEditedAt
    ? await countPendingIncorporateForUser(auth.userId)
    : 0;

  return NextResponse.json(serializeUserMemory(row, pendingIncorporateCount));
}

export async function PATCH(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const trimmed = parsed.data.blob.trim();
  const row = await writeUserMemory({
    userId: auth.userId,
    blob: trimmed,
    userEdited: true,
    allowEmpty: trimmed.length === 0,
    clearDirty: true,
  });

  const pendingIncorporateCount = row.lastUserEditedAt
    ? await countPendingIncorporateForUser(auth.userId)
    : 0;

  return NextResponse.json(serializeUserMemory(row, pendingIncorporateCount));
}
