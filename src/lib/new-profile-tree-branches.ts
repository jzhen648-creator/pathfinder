import type { PrismaClient } from "@prisma/client";

/**
 * Default root threads for a new life-tree profile: four branches per life area (24 rows),
 * aligned with default tree hub slot order (0→3). Labels are unique across limbs.
 */
export const NEW_PROFILE_ROOT_BRANCH_TEMPLATES = [
  { limbId: "finance", threadType: "Income", name: "Income" },
  { limbId: "finance", threadType: "Investing", name: "Investing" },
  { limbId: "finance", threadType: "Protection", name: "Protection" },
  { limbId: "finance", threadType: "Giving", name: "Giving" },
  { limbId: "work", threadType: "Career", name: "Career" },
  { limbId: "work", threadType: "Skills", name: "Skills" },
  { limbId: "work", threadType: "Projects", name: "Projects" },
  { limbId: "work", threadType: "Network", name: "Network" },
  { limbId: "becoming", threadType: "Purpose", name: "Purpose" },
  { limbId: "becoming", threadType: "Spirituality", name: "Spirituality" },
  { limbId: "becoming", threadType: "Inner work", name: "Inner work" },
  { limbId: "becoming", threadType: "Habits", name: "Habits" },
  { limbId: "people", threadType: "Family", name: "Family" },
  { limbId: "people", threadType: "Romance", name: "Romance" },
  { limbId: "people", threadType: "Friendships", name: "Friendships" },
  { limbId: "people", threadType: "Community", name: "Community" },
  { limbId: "health", threadType: "Movement", name: "Movement" },
  { limbId: "health", threadType: "Mind", name: "Mind" },
  { limbId: "health", threadType: "Sleep", name: "Sleep" },
  { limbId: "health", threadType: "Nutrition", name: "Nutrition" },
  { limbId: "pleasures", threadType: "Hobbies", name: "Hobbies" },
  { limbId: "pleasures", threadType: "Culture", name: "Culture" },
  { limbId: "pleasures", threadType: "Experiences", name: "Experiences" },
  { limbId: "pleasures", threadType: "Downtime", name: "Downtime" },
] as const;

/** Creates starter branches when the user has none (e.g. first onboarding completion). */
export async function ensureNewProfileBranches(prisma: PrismaClient, userId: string): Promise<void> {
  const count = await prisma.branch.count({ where: { userId } });
  if (count > 0) return;

  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < NEW_PROFILE_ROOT_BRANCH_TEMPLATES.length; i += 1) {
    const t = NEW_PROFILE_ROOT_BRANCH_TEMPLATES[i]!;
    await prisma.branch.create({
      data: {
        userId,
        limbId: t.limbId,
        label: t.threadType,
        name: t.name,
        status: "active",
        bloomStatus: "BUD",
        order: i,
        createdAt: new Date(base + i * 60_000),
      },
    });
  }
}
