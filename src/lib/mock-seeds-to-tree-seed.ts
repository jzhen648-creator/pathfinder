import type { Branch, Mark } from "@/lib/types";
import type { BloomStatus, BranchStatus, MarkSentiment } from "@prisma/client";

export type MockHubSeed = {
  limbId: Branch["limbId"];
  name: string;
  goal?: string;
  goalValue?: number;
  currentValue?: number;
  unit?: string;
  statusExtensive?: Branch["status"];
  events: Array<{
    date: string;
    title: string;
    description: string;
    type: Mark["type"];
    sentiment: Mark["sentiment"];
    value?: number | null;
  }>;
};

export type TreeBranchSeed = {
  limbId: string;
  threadType: string;
  name: string;
  goal: string | null;
  goalValue: number | null;
  currentValue: number | null;
  unit: string | null;
  status: BranchStatus;
  bloomStatus: BloomStatus;
  createdAt: Date;
};

export type TreeMarkSeed = {
  branchThreadType: string;
  limbId: string;
  title: string;
  description: string;
  date: Date;
  year: number;
  significance: number;
  sentiment: MarkSentiment;
  value: number | null;
  isTurningPoint: boolean;
  future: boolean;
};

export type TreeGoalMilestoneSeed = {
  title: string;
  description: string;
  position: number;
  completedAt: Date | null;
};

export type TreeGoalSeed = {
  branchThreadType: string;
  limbId: string;
  title: string;
  description: string;
  goalType: string;
  targetAmount: number | null;
  currentAmount: number | null;
  unit: string | null;
  bloomStatus: BloomStatus;
  significance: number;
  future: boolean;
  year: number;
  milestones: TreeGoalMilestoneSeed[];
};

/** “Today” for Jeremy’s 2026 narrative — marks after this render as future. */
const JEREMY_TREE_NOW = new Date("2026-05-15T12:00:00.000Z");

export function mockHubSeedsToTreeSeeds(
  hubs: MockHubSeed[],
  options?: { now?: Date },
): { branchSeeds: TreeBranchSeed[]; markSeeds: TreeMarkSeed[] } {
  const now = options?.now ?? JEREMY_TREE_NOW;

  const branchSeeds: TreeBranchSeed[] = hubs.map((hub) => ({
    limbId: hub.limbId,
    threadType: hub.name,
    name: hub.name,
    goal: hub.goal ?? null,
    goalValue: hub.goalValue ?? null,
    currentValue: hub.currentValue ?? null,
    unit: hub.unit ?? null,
    status: (hub.statusExtensive ?? "active") as BranchStatus,
    bloomStatus: "ACTIVE",
    createdAt: new Date(hub.events[0]?.date ?? "2024-01-01"),
  }));

  const markSeeds: TreeMarkSeed[] = [];
  for (const hub of hubs) {
    hub.events.forEach((event, index) => {
      const date = new Date(event.date);
      const future = date.getTime() > now.getTime();
      markSeeds.push({
        branchThreadType: hub.name,
        limbId: hub.limbId,
        title: event.title,
        description: event.description,
        date,
        year: date.getFullYear(),
        significance: index === hub.events.length - 1 ? 2 : 1,
        sentiment: event.sentiment as MarkSentiment,
        value: event.value ?? null,
        isTurningPoint: false,
        future,
      });
    });
  }

  return { branchSeeds, markSeeds };
}

/** Roadmap goals (tree hex nodes) — one per hub with goal text, milestones from timeline events. */
export function mockHubSeedsToGoalSeeds(hubs: MockHubSeed[], options?: { now?: Date }): TreeGoalSeed[] {
  const now = options?.now ?? JEREMY_TREE_NOW;

  return hubs
    .filter((hub) => (hub.goal ?? "").trim().length > 0)
    .map((hub) => {
      const source = hub.events.length >= 2 ? hub.events : hub.events;
      const milestones: TreeGoalMilestoneSeed[] = source.slice(0, 4).map((event, position) => {
        const date = new Date(event.date);
        const completed = date.getTime() <= now.getTime();
        return {
          title: event.title,
          description: event.description,
          position,
          completedAt: completed ? date : null,
        };
      });

      const completedCount = milestones.filter((m) => m.completedAt != null).length;
      let bloomStatus: BloomStatus = "ACTIVE";
      if (milestones.length > 0 && completedCount > 0 && completedCount < milestones.length) {
        bloomStatus = "ACTIVE";
      } else if (milestones.length > 0 && completedCount === milestones.length) {
        bloomStatus = "COMPLETE";
      } else if (milestones.length > 0) {
        bloomStatus = "ACTIVE";
      }

      const measurable =
        hub.goalValue != null &&
        hub.currentValue != null &&
        hub.unit != null &&
        !["n/a", "direction", "practice", "system", "balance", "issues"].includes(hub.unit);

      return {
        branchThreadType: hub.name,
        limbId: hub.limbId,
        title: hub.goal!.trim(),
        description: hub.events[hub.events.length - 1]?.description ?? hub.goal!.trim(),
        goalType: "project",
        targetAmount: measurable ? hub.goalValue! : null,
        currentAmount: measurable ? hub.currentValue! : null,
        unit: measurable ? hub.unit! : null,
        bloomStatus,
        significance: 3,
        future: false,
        year: now.getFullYear(),
        milestones,
      };
    });
}
