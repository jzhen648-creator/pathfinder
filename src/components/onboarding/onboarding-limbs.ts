import type { ComponentType } from "react";
import {
  LimbBecoming,
  LimbHealth,
  LimbMoney,
  LimbPeople,
  LimbWork,
} from "@/components/icons";
import type { IconSvgProps } from "@/components/icons/icon-svg-props";
import type { LifeAreaId } from "@/lib/types";

export type OnboardingLimbOption = {
  id: LifeAreaId;
  label: string;
  description: string;
  color: string;
  Icon: ComponentType<IconSvgProps>;
};

/** Display order: Work → Money → Becoming → People → Health */
export const ONBOARDING_LIMB_OPTIONS: readonly OnboardingLimbOption[] = [
  {
    id: "work",
    label: "Work",
    description: "Career, skills, projects",
    color: "#EF9F27",
    Icon: LimbWork,
  },
  {
    id: "finance",
    label: "Money",
    description: "Savings, income, debt",
    color: "#1D9E75",
    Icon: LimbMoney,
  },
  {
    id: "becoming",
    label: "Self & Mind",
    description: "Purpose & values, mind & emotions, joy & creativity",
    color: "#7F77DD",
    Icon: LimbBecoming,
  },
  {
    id: "people",
    label: "People",
    description: "Family, romance, friendships",
    color: "#D4537E",
    Icon: LimbPeople,
  },
  {
    id: "health",
    label: "Health",
    description: "Movement, nutrition, rest",
    color: "#D85A30",
    Icon: LimbHealth,
  },
] as const;
