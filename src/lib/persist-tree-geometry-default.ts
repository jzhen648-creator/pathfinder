import { writeFile } from "fs/promises";
import path from "path";
import {
  parseLayoutOverridesFromJson,
  type LayoutOverrides,
  type TreeGeometryDefaultFile,
} from "@/components/tree/tree-layout-edit";

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
