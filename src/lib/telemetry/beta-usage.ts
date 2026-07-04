import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BetaUsageEventInput = {
  name: string;
  props?: Record<string, unknown> | null;
  at?: Date;
};

const MAX_NAME_LENGTH = 64;
const MAX_PROP_KEYS = 20;
const MAX_PROP_STRING = 500;

function sanitizeProps(
  props: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props).slice(0, MAX_PROP_KEYS)) {
    if (typeof value === "string") {
      out[key] = value.slice(0, MAX_PROP_STRING);
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeBetaUsageEvent(
  event: BetaUsageEventInput,
): { ok: true; data: BetaUsageEventInput } | { ok: false; error: string } {
  const name = event.name.trim();
  if (!name || name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: "Invalid event name." };
  }
  if (!/^[a-z][a-z0-9._-]*$/i.test(name)) {
    return { ok: false, error: "Event name must be alphanumeric with . _ -" };
  }
  return {
    ok: true,
    data: {
      name,
      props: sanitizeProps(event.props ?? undefined),
      at: event.at,
    },
  };
}

export async function recordBetaUsageEvents(
  userId: string,
  events: BetaUsageEventInput[],
): Promise<number> {
  if (events.length === 0) return 0;

  const rows = events.map((event) => {
    const normalized = normalizeBetaUsageEvent(event);
    if (!normalized.ok) {
      throw new Error(normalized.error);
    }
    return {
      userId,
      name: normalized.data.name,
      props: normalized.data.props
        ? (normalized.data.props as Prisma.InputJsonValue)
        : undefined,
      createdAt: normalized.data.at ?? new Date(),
    };
  });

  const result = await prisma.betaUsageEvent.createMany({ data: rows });
  return result.count;
}
