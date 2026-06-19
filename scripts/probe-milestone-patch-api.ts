/**
 * Hit the live milestone PATCH route the same way mobile does (Bearer JWT).
 *
 * Usage:
 *   npx tsx scripts/probe-milestone-patch-api.ts
 *   npx tsx scripts/probe-milestone-patch-api.ts --base https://pathfinder-xi-rust.vercel.app
 *   npx tsx scripts/probe-milestone-patch-api.ts --base http://localhost:3001
 */
import { prisma } from "../src/lib/prisma";
import { signMobileSessionJwt } from "../src/lib/mobile-auth";

const baseArg = process.argv.find((a) => a.startsWith("--base="));
const base = (baseArg?.slice("--base=".length) ?? "https://pathfinder-xi-rust.vercel.app").replace(
  /\/$/,
  "",
);

async function main() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET missing — set in pathfinder/.env.local");
  }

  const milestone = await prisma.milestone.findFirst({
    where: {
      completedAt: null,
      goal: { goalType: { notIn: ["moment", "event"] }, archived: false },
    },
    include: {
      goal: {
        select: { id: true, userId: true, title: true },
      },
    },
    orderBy: { position: "asc" },
  });

  if (!milestone) {
    console.log("[probe-milestone-patch-api] no incomplete milestone found");
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: milestone.goal.userId },
    select: {
      id: true,
      name: true,
      email: true,
      onboardingCompleted: true,
      firstRunCompleted: true,
    },
  });
  if (!user) throw new Error("goal owner user not found");

  const token = await signMobileSessionJwt(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      onboardingCompleted: user.onboardingCompleted,
      firstRunCompleted: user.firstRunCompleted,
    },
    secret,
  );

  const completedAt = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const url = `${base}/api/goals/${encodeURIComponent(milestone.goalId)}/milestones/${encodeURIComponent(milestone.id)}`;

  console.log("[probe-milestone-patch-api] PATCH", {
    base,
    goalId: milestone.goalId,
    milestoneId: milestone.id,
    completedAt,
  });

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ completedAt }),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }

  console.log("[probe-milestone-patch-api] response", {
    status: response.status,
    body,
  });

  if (!response.ok) {
    process.exitCode = 1;
    return;
  }

  // Restore
  const restore = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ completedAt: null }),
  });
  const restoreText = await restore.text();
  console.log("[probe-milestone-patch-api] restored", {
    status: restore.status,
    body: restoreText.slice(0, 200),
  });
}

main()
  .catch((e) => {
    console.error("[probe-milestone-patch-api] error", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
