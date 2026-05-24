import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  getGroupedProfileFacts,
  profileFactCategorySchema,
  upsertProfileFactsForUser,
} from "@/lib/profile-memory";

const batchFactSchema = z.object({
  category: profileFactCategorySchema,
  key: z.string().trim().min(1).max(80).optional(),
  value: z.string().trim().min(1).max(500),
});

const batchSchema = z.object({
  facts: z.array(batchFactSchema).min(1).max(20),
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

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const result = await upsertProfileFactsForUser(
    userId,
    parsed.data.facts.map((fact) => ({
      category: fact.category,
      key: fact.key ?? fact.value,
      value: fact.value,
      confidence: 1,
    })),
    "user_manual",
  );

  const facts = await getGroupedProfileFacts(userId);
  return NextResponse.json({ ok: true, ...result, facts });
}
