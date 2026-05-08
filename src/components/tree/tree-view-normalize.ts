import type { RawBranch, RawMark, RawTreeGoalPayload } from "./tree-data";
import type { BranchesResponse, MarksResponse } from "./tree-view-types";

export function normalizeBranches(payload: BranchesResponse): RawBranch[] {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.branches) ? payload.branches : [];
  return rows as RawBranch[];
}

export function normalizeMarks(payload: MarksResponse): RawMark[] {
  const rows = Array.isArray(payload?.marks) ? payload.marks : [];
  return rows as RawMark[];
}

export function normalizeGoalsFromBranches(payload: BranchesResponse): RawTreeGoalPayload[] {
  if (Array.isArray(payload)) return [];
  const rows = Array.isArray(payload.goals) ? payload.goals : [];
  return rows as RawTreeGoalPayload[];
}
