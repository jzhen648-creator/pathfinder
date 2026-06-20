import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { updateUserMemory } from "@/lib/memory/update-memory";
import { serializeUserMemory } from "@/lib/memory/memory-write";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  sessionText: z.string().trim().min(1).max(8000),
});

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const row = await updateUserMemory(auth.userId, parsed.data.sessionText);
  if (!row) {
    const existing = await prisma.userMemory.findUnique({ where: { userId: auth.userId } });
    const paused = Boolean(existing?.lastUserEditedAt);

    if (paused) {
      return NextResponse.json({
        ok: false,
        paused: true,
        isDirty: existing?.isDirty ?? true,
        pendingIncorporateCount: 0,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        isDirty: existing?.isDirty ?? true,
        pendingIncorporateCount: 0,
        error: "Memory update did not complete.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    memory: serializeUserMemory(row, 0),
  });
}
