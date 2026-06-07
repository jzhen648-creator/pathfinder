import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { persistStreamSessionForMemory } from "@/lib/memory/persist-stream-session";
import { incorporatePendingMemory, updateUserMemory, countPendingIncorporateForUser } from "@/lib/memory/update-memory";
import { serializeUserMemory } from "@/lib/memory/memory-write";
import { prisma } from "@/lib/prisma";

const bodySchema = z
  .object({
    sessionText: z.string().trim().min(1).max(8000).optional(),
    limbId: z.string().min(1).max(64).optional(),
    incorporatePending: z.literal(true).optional(),
  })
  .refine(
    (value) => value.incorporatePending === true || typeof value.sessionText === "string",
    { message: "sessionText or incorporatePending is required" },
  );

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

  if (parsed.data.incorporatePending) {
    const row = await incorporatePendingMemory(auth.userId);
    if (!row) {
      const existing = await prisma.userMemory.findUnique({ where: { userId: auth.userId } });
      return NextResponse.json(
        {
          ok: false,
          error: "Nothing to incorporate.",
          isDirty: existing?.isDirty ?? false,
          pendingIncorporateCount: existing?.lastUserEditedAt
            ? await countPendingIncorporateForUser(auth.userId)
            : 0,
        },
        { status: 400 },
      );
    }

    const pendingIncorporateCount = row.lastUserEditedAt
      ? await countPendingIncorporateForUser(auth.userId)
      : 0;

    return NextResponse.json({
      ok: true,
      memory: serializeUserMemory(row, pendingIncorporateCount),
    });
  }

  const sessionText = parsed.data.sessionText!;
  const limbId = parsed.data.limbId ?? "global";

  await persistStreamSessionForMemory(auth.userId, limbId, sessionText);

  const row = await updateUserMemory(auth.userId, sessionText);
  if (!row) {
    const existing = await prisma.userMemory.findUnique({ where: { userId: auth.userId } });
    const paused = Boolean(existing?.lastUserEditedAt);
    const pendingIncorporateCount = paused
      ? await countPendingIncorporateForUser(auth.userId)
      : 0;

    if (paused) {
      return NextResponse.json({
        ok: false,
        paused: true,
        isDirty: existing?.isDirty ?? true,
        pendingIncorporateCount,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        isDirty: existing?.isDirty ?? true,
        pendingIncorporateCount,
        error: "Memory update did not complete.",
      },
      { status: 502 },
    );
  }

  const pendingIncorporateCount = row.lastUserEditedAt
    ? await countPendingIncorporateForUser(auth.userId)
    : 0;

  return NextResponse.json({
    ok: true,
    memory: serializeUserMemory(row, pendingIncorporateCount),
  });
}
