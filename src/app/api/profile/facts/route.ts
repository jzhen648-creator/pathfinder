import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getGroupedProfileFacts,
  normalizeProfileFactKey,
  profileFactInputSchema,
  serializeProfileFact,
} from "@/lib/profile-memory";

const createFactSchema = profileFactInputSchema.extend({
  key: z.string().trim().min(1).max(80).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const facts = await getGroupedProfileFacts(userId);
  return NextResponse.json({ facts });
}

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

  const parsed = createFactSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const key = normalizeProfileFactKey(parsed.data.key ?? parsed.data.value);
  const fact = await prisma.profileFact.upsert({
    where: {
      userId_category_key: {
        userId,
        category: parsed.data.category,
        key,
      },
    },
    create: {
      userId,
      category: parsed.data.category,
      key,
      value: parsed.data.value,
      source: "user_manual",
    },
    update: {
      value: parsed.data.value,
      confidence: null,
      source: "user_manual",
    },
  });

  return NextResponse.json({ fact: serializeProfileFact(fact) });
}
