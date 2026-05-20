import type { RawBranch, RawMark, RawTreeGoalPayload } from "./tree-data";
import type { ArchivedGoalRow, BranchesResponse, MarksResponse } from "./tree-view-types";

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

export function normalizeArchivedGoalsFromBranches(payload: BranchesResponse): ArchivedGoalRow[] {
  if (Array.isArray(payload)) return [];
  const rows = Array.isArray(payload.archivedGoals) ? payload.archivedGoals : [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as { id?: unknown; title?: unknown; branchId?: unknown };
      if (typeof r.id !== "string" || typeof r.title !== "string") return null;
      return {
        id: r.id,
        title: r.title,
        branchId: typeof r.branchId === "string" ? r.branchId : null,
      };
    })
    .filter((r): r is ArchivedGoalRow => r !== null);
}
