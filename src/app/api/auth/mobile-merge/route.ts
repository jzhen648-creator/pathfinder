import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  buildMobileAuthResponse,
  DUMMY_BCRYPT_HASH,
  requireAuthSecret,
  type MobileAuthResponse,
} from "@/lib/mobile-auth";
import { ensureTaxonomyCurrent } from "@/lib/taxonomy-sync";
import { mergeAnonymousMapIntoAccount } from "@/lib/merge-anonymous-map";
import { recordBetaUsageEvents } from "@/lib/telemetry/beta-usage";
import {
  AUTH_RATE_LIMITS,
  clientIpFromRequest,
  consumeAuthRateLimit,
  rateLimitedResponse,
} from "@/lib/auth-rate-limit";

const mergeSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

/**
 * Move the current anonymous session's map into an existing email/password
 * account ("Move it in" on sign-in from a guest session). Verifies the target
 * credentials like `mobile-login`, reassigns all map data to the target user,
 * deletes the anonymous shell, and returns a session for the target account.
 */
export async function POST(request: Request) {
  const secret = requireAuthSecret();
  if (typeof secret !== "string") {
    return NextResponse.json({ error: secret.error }, { status: secret.status });
  }

  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const ip = clientIpFromRequest(request);
  const ipLimit = consumeAuthRateLimit(`merge:ip:${ip}`, AUTH_RATE_LIMITS.login);
  if (ipLimit.limited) {
    return rateLimitedResponse(ipLimit.retryAfterSeconds);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = mergeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const emailLimit = consumeAuthRateLimit(`merge:email:${email}`, AUTH_RATE_LIMITS.login);
  if (emailLimit.limited) {
    return rateLimitedResponse(emailLimit.retryAfterSeconds);
  }

  const source = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!source) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!source.isAnonymous) {
    return NextResponse.json(
      { error: "This account is already saved — sign in normally instead." },
      { status: 409 },
    );
  }

  // Credential failures are 403, not 401: the caller's guest session is still
  // valid, and the mobile client treats 401-with-token as session expiry
  // (global sign-out), which would orphan the guest map on a typo.
  // Fallback lookup with the raw casing covers accounts registered before
  // email normalization landed.
  const target =
    (await prisma.user.findUnique({ where: { email } })) ??
    (parsed.data.email.trim() !== email
      ? await prisma.user.findUnique({ where: { email: parsed.data.email.trim() } })
      : null);
  if (!target || !target.passwordHash || target.isAnonymous || target.id === source.id) {
    // Equalize timing with the valid-target path so response time doesn't
    // reveal whether the email has an account.
    await bcrypt.compare(parsed.data.password, DUMMY_BCRYPT_HASH);
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 403 },
    );
  }

  const valid = await bcrypt.compare(parsed.data.password, target.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 403 },
    );
  }

  // Slow on remote DBs — run before the transaction so it cannot blow the tx timeout.
  await ensureTaxonomyCurrent(prisma, target.id);

  // Serializable: the merge now moves the source domain as well, and a
  // concurrent capture must not slip a row past the pre-delete assertion.
  const result = await prisma.$transaction(
    (tx) => mergeAnonymousMapIntoAccount(tx, source.id, target.id),
    {
      maxWait: 10_000,
      timeout: 30_000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  await recordBetaUsageEvents(target.id, [
    { name: "auth.merge", props: { movedGoals: result.movedGoals } },
  ]).catch(() => {
    // Non-blocking
  });

  const response: MobileAuthResponse = await buildMobileAuthResponse(target, secret);
  return NextResponse.json(response);
}
