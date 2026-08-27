import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  AUTH_RATE_LIMITS,
  clientIpFromRequest,
  consumeAuthRateLimit,
  rateLimitedResponse,
} from "@/lib/auth-rate-limit";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function appBaseUrl(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    new URL(request.url).origin
  ).replace(/\/$/, "");
}

/**
 * Deep link that opens the reset screen directly in the Almanac app when it is
 * installed (scheme matches `app.json` → `expo.scheme`). The web link stays the
 * primary CTA so the email still works from a desktop browser.
 */
function appResetDeepLink(token: string): string {
  const scheme = process.env.PASSWORD_RESET_APP_SCHEME?.trim() || "pathfinder";
  return `${scheme}://reset-password/${token}`;
}

function resetPasswordHtml(resetUrl: string, appLink: string): string {
  return `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#18181b">
      <h1 style="font-size:20px;margin:0 0 12px">Reset your Almanac password</h1>
      <p style="margin:0 0 16px">Use the button below to set a new password for your Almanac account.</p>
      <p style="margin:0 0 20px">
        <a href="${resetUrl}" style="display:inline-block;border-radius:10px;background:#4f46e5;color:#fff;padding:11px 16px;text-decoration:none;font-weight:600">
          Reset password
        </a>
      </p>
      <p style="margin:0 0 20px;color:#71717a;font-size:14px">
        On your phone with the app installed? <a href="${appLink}" style="color:#4f46e5;text-decoration:none;font-weight:600">Open in the Almanac app</a>.
      </p>
      <p style="margin:0;color:#71717a;font-size:14px">This link expires in 1 hour. If you did not request it, you can ignore this email.</p>
    </div>
  `;
}

export async function POST(request: Request) {
  try {
    const ip = clientIpFromRequest(request);
    const ipLimit = consumeAuthRateLimit(`forgot:ip:${ip}`, AUTH_RATE_LIMITS.forgotPassword);
    if (ipLimit.limited) {
      return rateLimitedResponse(ipLimit.retryAfterSeconds);
    }

    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: true });
    }

    const email = parsed.data.email.trim();

    const emailLimit = consumeAuthRateLimit(
      `forgot:email:${email.toLowerCase()}`,
      AUTH_RATE_LIMITS.forgotPassword,
    );
    if (emailLimit.limited) {
      return rateLimitedResponse(emailLimit.retryAfterSeconds);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const token = randomBytes(32).toString("hex");
    const resetUrl = `${appBaseUrl(request)}/reset-password/${token}`;
    const appLink = appResetDeepLink(token);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashResetToken(token),
        passwordResetExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.PASSWORD_RESET_FROM_EMAIL?.trim();
    if (!apiKey || !from) {
      console.warn("[forgot-password] Resend is not configured; reset email was not sent.");
      return NextResponse.json({ ok: true });
    }

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: user.email,
      subject: "Reset your Almanac password",
      html: resetPasswordHtml(resetUrl, appLink),
      text: [
        "Reset your Almanac password",
        "",
        "Use this link to set a new password:",
        resetUrl,
        "",
        "On your phone with the Almanac app installed, open this instead:",
        appLink,
        "",
        "This link expires in 1 hour. If you did not request it, you can ignore this email.",
      ].join("\n"),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[forgot-password]", error);
    return NextResponse.json({ ok: true });
  }
}
