import { NextResponse } from "next/server";
import { isReflectCallEnabled } from "@/lib/ai/reflect-call";
import { hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public liveness probe — no auth. Use for uptime monitors and pre-smoke checks. */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: "up",
      ai: hasGeminiKey() ? "configured" : "missing",
      reflect: isReflectCallEnabled(),
      deliveryBypass: process.env.AI_READING_DELIVERY_BYPASS === "true",
      latencyMs: Date.now() - started,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        error: message,
        latencyMs: Date.now() - started,
        ts: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
