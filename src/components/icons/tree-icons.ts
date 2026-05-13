import type { ComponentType } from "react";
import type { LifeAreaId } from "@/lib/types";
import type { IconSvgProps } from "./icon-svg-props";
import { ICON_DESIGN_SIZE } from "./icon-svg-props";
import { BranchCareer } from "./branch/BranchCareer";
import { BranchCommunity } from "./branch/BranchCommunity";
import { BranchCulture } from "./branch/BranchCulture";
import { BranchDowntime } from "./branch/BranchDowntime";
import { BranchExperiences } from "./branch/BranchExperiences";
import { BranchFamily } from "./branch/BranchFamily";
import { BranchFriendships } from "./branch/BranchFriendships";
import { BranchGiving } from "./branch/BranchGiving";
import { BranchHabits } from "./branch/BranchHabits";
import { BranchHobbies } from "./branch/BranchHobbies";
import { BranchIncome } from "./branch/BranchIncome";
import { BranchInnerWork } from "./branch/BranchInnerWork";
import { BranchInvesting } from "./branch/BranchInvesting";
import { BranchMind } from "./branch/BranchMind";
import { BranchMovement } from "./branch/BranchMovement";
import { BranchNetwork } from "./branch/BranchNetwork";
import { BranchNutrition } from "./branch/BranchNutrition";
import { BranchProjects } from "./branch/BranchProjects";
import { BranchProtection } from "./branch/BranchProtection";
import { BranchPurpose } from "./branch/BranchPurpose";
import { BranchRomance } from "./branch/BranchRomance";
import { BranchSkills } from "./branch/BranchSkills";
import { BranchSleep } from "./branch/BranchSleep";
import { BranchSpirituality } from "./branch/BranchSpirituality";
import { LimbBecoming } from "./limb/LimbBecoming";
import { LimbHealth } from "./limb/LimbHealth";
import { LimbMoney } from "./limb/LimbMoney";
import { LimbPeople } from "./limb/LimbPeople";
import { LimbPleasures } from "./limb/LimbPleasures";
import { LimbWork } from "./limb/LimbWork";

/** Registry entry for SVG limb / branch icons used on the tree. */
export type TreeIconComponent = ComponentType<IconSvgProps>;

/**
 * Limb icons — locked taxonomy ↔ {@link LifeAreaId}:
 * Work & Learning → work · Money & Finance → finance · Who I'm Becoming → becoming ·
 * People & Relationships → people · Health & Body → health · Pleasures → pleasures.
 * Matches reference/pathfinder-icons-v2 limb row.
 */
export const LIMB_ICONS: Record<LifeAreaId, TreeIconComponent> = {
  work: LimbWork,
  finance: LimbMoney,
  becoming: LimbBecoming,
  people: LimbPeople,
  health: LimbHealth,
  pleasures: LimbPleasures,
};

/**
 * Branch icons by slot index 0→3 (aligned with default hub order in `tree-area-anchors`).
 * Locked taxonomy — Work: Career, Skills, Projects, Network · Finance: Income, Investing, Protection, Giving ·
 * Becoming: Purpose, Spirituality, Inner work, Habits · People: Family, Romance, Friendships, Community ·
 * Health: Movement, Mind, Sleep, Nutrition · Pleasures: Hobbies, Culture, Experiences, Downtime.
 * Overflow threads use {@link normalizedBranchIndex}.
 */
export const BRANCH_ICONS_BY_LIMB: Record<
  LifeAreaId,
  readonly [TreeIconComponent, TreeIconComponent, TreeIconComponent, TreeIconComponent]
> = {
  work: [BranchCareer, BranchSkills, BranchProjects, BranchNetwork],
  finance: [BranchIncome, BranchInvesting, BranchProtection, BranchGiving],
  becoming: [BranchPurpose, BranchSpirituality, BranchInnerWork, BranchHabits],
  people: [BranchFamily, BranchRomance, BranchFriendships, BranchCommunity],
  health: [BranchMovement, BranchMind, BranchSleep, BranchNutrition],
  pleasures: [BranchHobbies, BranchCulture, BranchExperiences, BranchDowntime],
};

function normalizedBranchIndex(branchIndex: number): number {
  const n = Math.floor(branchIndex);
  return ((n % 4) + 4) % 4;
}

export function limbIconForLifeArea(areaId: LifeAreaId): TreeIconComponent {
  return LIMB_ICONS[areaId];
}

/**
 * Max bbox edge length of each limb glyph in the shared {@link ICON_DESIGN_SIZE} coordinate space.
 * All icons scale with `size / 24`, but artwork fills different portions — People reads small,
 * Health large — unless we normalize the `size` passed at render time.
 */
export const LIMB_ICON_ARTWORK_EXTENT_MAX: Record<LifeAreaId, number> = {
  work: 28,
  finance: 28,
  becoming: 24,
  people: 18,
  health: 30,
  pleasures: 26,
};

/** `size` prop so the glyph's artwork spans `targetPx` on screen (square). */
export function normalizedLimbIconSize(areaId: LifeAreaId, targetPx: number): number {
  return (targetPx * ICON_DESIGN_SIZE) / LIMB_ICON_ARTWORK_EXTENT_MAX[areaId];
}

export function branchIconForSlot(areaId: LifeAreaId, branchIndex: number): TreeIconComponent {
  const slot = normalizedBranchIndex(branchIndex);
  return BRANCH_ICONS_BY_LIMB[areaId][slot];
}
