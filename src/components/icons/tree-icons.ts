import type { ComponentType } from "react";
import { canonicalHubDisplayLabel } from "@/lib/hub-catalog";
import { hubCountForTheme } from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";
import type { IconSvgProps } from "./icon-svg-props";
import { ICON_DESIGN_SIZE } from "./icon-svg-props";
import { BranchCareer } from "./branch/BranchCareer";
import { BranchExperiences } from "./branch/BranchExperiences";
import { BranchFamily } from "./branch/BranchFamily";
import { BranchFriendships } from "./branch/BranchFriendships";
import { BranchDebt } from "./branch/BranchDebt";
import { BranchIncome } from "./branch/BranchIncome";
import { BranchInnerWork } from "./branch/BranchInnerWork";
import { BranchInvesting } from "./branch/BranchInvesting";
import { BranchHammer } from "./branch/BranchHammer";
import { BranchMovement } from "./branch/BranchMovement";
import { BranchNutrition } from "./branch/BranchNutrition";
import { BranchProjects } from "./branch/BranchProjects";
import { BranchProtection } from "./branch/BranchProtection";
import { BranchPurpose } from "./branch/BranchPurpose";
import { BranchRomance } from "./branch/BranchRomance";
import { BranchSkills } from "./branch/BranchSkills";
import { BranchSleep } from "./branch/BranchSleep";
import { LimbBecoming } from "./limb/LimbBecoming";
import { LimbHealth } from "./limb/LimbHealth";
import { LimbMoney } from "./limb/LimbMoney";
import { LimbPeople } from "./limb/LimbPeople";
import { LimbWork } from "./limb/LimbWork";

/** Registry entry for SVG limb / branch icons used on the tree. */
export type TreeIconComponent = ComponentType<IconSvgProps>;

export const LIMB_ICONS: Record<LifeAreaId, TreeIconComponent> = {
  work: LimbWork,
  finance: LimbMoney,
  becoming: LimbBecoming,
  people: LimbPeople,
  health: LimbHealth,
};

/** Locked hub label → icon (canonical names from `LOCKED_HUB_TEMPLATES`). */
export const HUB_BRANCH_ICONS: Record<LifeAreaId, Record<string, TreeIconComponent>> = {
  finance: {
    Income: BranchIncome,
    Assets: BranchInvesting,
    "Safety net": BranchProtection,
    Liabilities: BranchDebt,
  },
  work: {
    Career: BranchCareer,
    Skills: BranchHammer,
    "Builds & Launches": BranchProjects,
  },
  becoming: {
    "Purpose & Values": BranchPurpose,
    "Mind & Emotions": BranchInnerWork,
    "Joy & Creativity": BranchExperiences,
  },
  people: {
    Family: BranchFamily,
    Romance: BranchRomance,
    Friendships: BranchFriendships,
  },
  health: {
    Movement: BranchMovement,
    Nutrition: BranchNutrition,
    Appearance: BranchSkills,
    Rest: BranchSleep,
  },
};

/** Slot-order fallback — matches `LOCKED_HUB_TEMPLATES` per theme. */
export const BRANCH_ICONS_BY_LIMB: Record<LifeAreaId, readonly TreeIconComponent[]> = {
  work: [BranchCareer, BranchHammer, BranchProjects],
  finance: [BranchIncome, BranchInvesting, BranchProtection, BranchDebt],
  becoming: [BranchPurpose, BranchInnerWork, BranchExperiences],
  people: [BranchFamily, BranchRomance, BranchFriendships],
  health: [BranchMovement, BranchNutrition, BranchSkills, BranchSleep],
};

export const DEFAULT_HUB_SLOT_COUNT: Record<LifeAreaId, number> = {
  work: 3,
  finance: 4,
  becoming: 3,
  people: 3,
  health: 4,
};

function normalizedBranchIndex(branchIndex: number, slotCount: number): number {
  const n = Math.floor(branchIndex);
  return ((n % slotCount) + slotCount) % slotCount;
}

export function limbIconForLifeArea(areaId: LifeAreaId): TreeIconComponent {
  return LIMB_ICONS[areaId];
}

export const LIMB_ICON_ARTWORK_EXTENT_MAX: Record<LifeAreaId, number> = {
  work: 20,
  finance: 20,
  becoming: 20,
  people: 20,
  health: 20,
};

export function normalizedLimbIconSize(areaId: LifeAreaId, targetPx: number): number {
  return (targetPx * ICON_DESIGN_SIZE) / LIMB_ICON_ARTWORK_EXTENT_MAX[areaId];
}

/** Resolve icon by hub display name (preferred) with slot-index fallback. */
export function branchIconForHub(
  areaId: LifeAreaId,
  hubLabel: string,
  branchIndex: number,
): TreeIconComponent {
  const canonical = canonicalHubDisplayLabel(areaId, hubLabel);
  const byTheme = HUB_BRANCH_ICONS[areaId];
  if (byTheme[canonical]) return byTheme[canonical]!;
  const needle = canonical.trim().toLowerCase();
  const key = Object.keys(byTheme).find((k) => k.toLowerCase() === needle);
  if (key) return byTheme[key]!;
  return branchIconForSlot(areaId, branchIndex);
}

export function branchIconForSlot(areaId: LifeAreaId, branchIndex: number): TreeIconComponent {
  const icons = BRANCH_ICONS_BY_LIMB[areaId];
  const slotCount = icons.length || hubCountForTheme(areaId);
  const slot = normalizedBranchIndex(branchIndex, slotCount);
  return icons[slot] ?? icons[0]!;
}
