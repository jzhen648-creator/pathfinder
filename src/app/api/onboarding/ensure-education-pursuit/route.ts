import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  ensureEducationPursuit,
  type EnsureEducationPursuitResult,
} from "@/lib/onboarding/ensure-education-pursuit";

const requestSchema = z.object({
  educationLevel: z.enum(["secondary", "further", "higher"]),
  mapGridQ: z.number().int().optional(),
  mapGridR: z.number().int().optional(),
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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  try {
    const result: EnsureEducationPursuitResult = await ensureEducationPursuit(auth.userId, {
      educationLevel: parsed.data.educationLevel,
      mapGridQ: parsed.data.mapGridQ,
      mapGridR: parsed.data.mapGridR,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[onboarding/ensure-education-pursuit]", error);
    const message =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : "Could not ensure education pursuit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
