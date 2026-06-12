import { writeFile } from "fs/promises";
import path from "path";

export type Point = { x: number; y: number };

export type BranchLayoutOverride = {
  forkPoint?: Point;
  rotateDeg?: number;
  tip?: Point;
  forkTiltDeg?: number;
  tipTiltDeg?: number;
  bendPoints?: Point[];
  bendPoint?: Point;
};

export type AreaLayoutOverride = {
  limbRotateDeg?: number;
  limbTip?: Point;
  limbFirstC2?: Point;
  limbForkTiltDeg?: number;
  limbTipTiltDeg?: number;
  branches?: Record<number, BranchLayoutOverride>;
  threads?: Record<number, BranchLayoutOverride>;
  momentPositions?: Record<string, Point>;
  hubPositions?: Record<string, Point>;
};

export type LayoutOverrides = Record<string, AreaLayoutOverride>;

export type TreeGeometryDefaultFile = {
  exportedAt: string;
  layoutOverrides: LayoutOverrides;
  resolvedForks?: Record<string, unknown>;
};

export function parseLayoutOverridesFromJson(json: unknown): LayoutOverrides | null {
  if (json == null || typeof json !== "object") return null;
  const rec = json as Record<string, unknown>;
  const candidate =
    "layoutOverrides" in rec && rec.layoutOverrides != null ? rec.layoutOverrides : json;
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate as LayoutOverrides;
}

export const TREE_GEOMETRY_DEFAULT_RELATIVE_PATH = "src/data/pathfinder-tree-geometry.json";

export function parseTreeGeometryDefaultPayload(body: unknown): TreeGeometryDefaultFile | null {
  if (body == null || typeof body !== "object") return null;
  const layoutOverrides = parseLayoutOverridesFromJson(body);
  if (layoutOverrides == null) return null;
  const rec = body as Record<string, unknown>;
  if (rec.resolvedForks != null) {
    if (typeof rec.resolvedForks !== "object" || Array.isArray(rec.resolvedForks)) return null;
  }
  const exportedAt =
    typeof rec.exportedAt === "string" && rec.exportedAt.length > 0
      ? rec.exportedAt
      : new Date().toISOString();
  return {
    exportedAt,
    layoutOverrides,
    ...(rec.resolvedForks != null
      ? { resolvedForks: rec.resolvedForks as TreeGeometryDefaultFile["resolvedForks"] }
      : {}),
  };
}

export async function writeTreeGeometryDefaultFile(
  payload: TreeGeometryDefaultFile,
): Promise<{ filePath: string }> {
  const filePath = path.join(process.cwd(), TREE_GEOMETRY_DEFAULT_RELATIVE_PATH);
  const normalized: TreeGeometryDefaultFile = {
    exportedAt: payload.exportedAt,
    layoutOverrides: payload.layoutOverrides as LayoutOverrides,
    ...(payload.resolvedForks != null ? { resolvedForks: payload.resolvedForks } : {}),
  };
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return { filePath };
}
