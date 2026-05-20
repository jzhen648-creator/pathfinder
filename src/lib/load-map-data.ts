import { mapToTreeData } from "@/components/tree/tree-data";
import type { AreaData } from "@/components/tree/tree-types";
import {
  normalizeBranches,
  normalizeGoalsFromBranches,
  normalizeMarks,
} from "@/components/tree/tree-view-normalize";
import type { BranchesResponse, MarksResponse } from "@/components/tree/tree-view-types";
import { deriveMapIssues, type MapIssuesSnapshot } from "@/lib/map-issues";

export type LoadMapDataResult =
  | {
      ok: true;
      areas: AreaData[];
      branchesJson: BranchesResponse;
      marksJson: MarksResponse;
      issues: MapIssuesSnapshot;
    }
  | { ok: false; error: string };

async function parseJson<T>(res: Response, label: string): Promise<T | null> {
  const text = await res.text();
  if (!text.trim()) {
    if (!res.ok) {
      console.error(`[load-map-data] GET ${label} empty body`, { status: res.status });
    }
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error(`[load-map-data] GET ${label} invalid JSON`, { status: res.status, err });
    return null;
  }
}

/** Load branches + marks and build tree areas (same sources as TreeView). */
export async function loadMapData(): Promise<LoadMapDataResult> {
  const fetchOpts: RequestInit = { cache: "no-store", signal: AbortSignal.timeout(30_000) };
  try {
    const [marksRes, branchesRes] = await Promise.all([
      fetch("/api/marks?includeArchived=true", fetchOpts),
      fetch("/api/branches", fetchOpts),
    ]);

    const marksJson = await parseJson<MarksResponse>(marksRes, "/api/marks");
    const branchesJson = await parseJson<BranchesResponse>(branchesRes, "/api/branches");

    if (!branchesRes.ok || branchesJson == null) {
      const apiErr =
        branchesJson &&
        typeof branchesJson === "object" &&
        "error" in branchesJson &&
        typeof (branchesJson as { error?: unknown }).error === "string"
          ? (branchesJson as { error: string }).error
          : null;
      return {
        ok: false,
        error: apiErr ?? `Could not load hubs (${branchesRes.status}).`,
      };
    }

    const allMarks = normalizeMarks(marksJson ?? { marks: [] });
    const marks = allMarks.filter((m) => !m.archived);
    const branches = normalizeBranches(branchesJson);
    const goals = normalizeGoalsFromBranches(branchesJson);

    let areas: AreaData[];
    try {
      areas = mapToTreeData(branches, marks, goals);
    } catch (err) {
      console.error("[load-map-data] mapToTreeData failed", err);
      return { ok: false, error: "Tree data could not be built." };
    }

    const issues = deriveMapIssues({ areas, goals, marks });

    return {
      ok: true,
      areas,
      branchesJson,
      marksJson: marksJson ?? { marks: [] },
      issues,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      error: aborted ? "Request timed out." : "Could not load map data.",
    };
  }
}
