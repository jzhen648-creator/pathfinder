import { NextResponse } from "next/server";
import { z } from "zod";

import { AccountPasswordError, deleteAccountForUser } from "@/lib/account-data";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  AUTH_RATE_LIMITS,
  consumeAuthRateLimit,
  rateLimitedResponse,
} from "@/lib/auth-rate-limit";

const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password.").max(128, "Password is too long."),
});

export async function DELETE(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = consumeAuthRateLimit(
    `delete-account:user:${auth.userId}`,
    AUTH_RATE_LIMITS.login,
  );
  if (rateLimit.limited) return rateLimitedResponse(rateLimit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  try {
    await deleteAccountForUser(auth.userId, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccountPasswordError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[delete-account]", error);
    return NextResponse.json(
      { error: "Could not delete the account right now. Nothing was changed." },
      { status: 500 },
    );
  }
}
