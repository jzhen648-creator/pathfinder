import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { serializeUserMemory, writeUserMemory } from "@/lib/memory/memory-write";
import { seedUserMemory } from "@/lib/memory/seed-memory";

const patchSchema = z.object({
  blob: z.string().trim().min(1).max(4000),
});

export async function GET() {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  let row = await prisma.userMemory.findUnique({ where: { userId: auth.userId } });
  if (!row?.blob.trim()) {
    row = (await seedUserMemory(auth.userId)) ?? row;
  }

  if (!row?.blob.trim()) {
    return NextResponse.json({
      blob: "",
      version: 0,
      updatedAt: null,
      lastUserEditedAt: null,
      isDirty: false,
      streamSessionCount: 0,
    });
  }

  return NextResponse.json(serializeUserMemory(row));
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

  const row = await writeUserMemory({
    userId: auth.userId,
    blob: parsed.data.blob,
    userEdited: true,
    clearDirty: true,
  });

  return NextResponse.json(serializeUserMemory(row));
}
