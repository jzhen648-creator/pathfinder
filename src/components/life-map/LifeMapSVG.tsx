"use client";

import { memo } from "react";

type LifeMapSVGProps = {
  branches: unknown[];
  moments: unknown[];
  zoom: number;
  pan: { x: number; y: number };
  onMomentClick: (id: string) => void;
  onMomentHover: (id: string | null) => void;
  onBranchClick: (id: string) => void;
  onGapClick: (payload: unknown) => void;
  focusedBranch: string | null;
  selectedMomentId: string | null;
};

export const LifeMapSVG = memo(function LifeMapSVG(props: LifeMapSVGProps) {
  const branchEntries = props.branches as Array<{ id: string }>;
  const allMoments = props.moments as Array<{ branch: string; mapPosition: number }>;
  const sortedByBranch = branchEntries.map((branch) =>
    allMoments
      .filter((m) => m.branch === branch.id)
      .sort((a, b) => a.mapPosition - b.mapPosition),
  );
  void sortedByBranch;
  return null;
});
