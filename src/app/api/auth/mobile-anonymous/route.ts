import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureTaxonomyCurrent } from "@/lib/taxonomy-sync";
import {
  ANONYMOUS_EMAIL_DOMAIN,
  buildMobileAuthResponse,
  requireAuthSecret,
  type MobileAuthResponse,
} from "@/lib/mobile-auth";
import { recordBetaUsageEvents } from "@/lib/telemetry/beta-usage";
import {
  AUTH_RATE_LIMITS,
  clientIpFromRequest,
  consumeAuthRateLimit,
  rateLimitedResponse,
} from "@/lib/auth-rate-limit";

/**
 * Silent guest-first mint. Creates a device-scoped anonymous User with a
 * placeholder email and no password; returns a session JWT so the mobile
 * client can enter onboarding / map without a signup form.
 */
export async function POST(request: Request) {
  const secret = requireAuthSecret();
  if (typeof secret !== "string") {
    return NextResponse.json({ error: secret.error }, { status: secret.status });
  }

  const ip = clientIpFromRequest(request);
  const ipLimit = consumeAuthRateLimit(`anonymous:ip:${ip}`, AUTH_RATE_LIMITS.anonymous);
  if (ipLimit.limited) {
    return rateLimitedResponse(ipLimit.retryAfterSeconds);
  }

  const email = `anon-${randomUUID()}@${ANONYMOUS_EMAIL_DOMAIN}`;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      isAnonymous: true,
      onboardingCompleted: false,
    },
  });

  // Taxonomy seeds on first map-data / goals call — don't block mint (~30s on remote DB).
  void ensureTaxonomyCurrent(prisma, user.id).catch((err) => {
    console.warn("[mobile-anonymous] taxonomy seed failed", err);
  });

  await recordBetaUsageEvents(user.id, [{ name: "auth.anonymous" }]).catch(() => {
    // Non-blocking
  });

  const response: MobileAuthResponse = await buildMobileAuthResponse(user, secret);
  return NextResponse.json(response);
}
