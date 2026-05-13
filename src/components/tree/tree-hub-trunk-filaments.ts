import { pathPointAtT, pathTangentAtT } from "./tree-branch-geometry";
import type { Point } from "./tree-types";

export type HubTrunkFilamentSpec = {
  key: string;
  d: string;
  strokeWidth: number;
  strokeOpacity: number;
};

function hash01(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)!;
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 4096) / 4096;
}

/**
 * Draw-only vascular filaments parallel to an existing stem `d` path (hub trunk→gateway bridge).
 * Hit-testing stays on the parent path; these are decorative polylines only.
 */
export function hubTrunkFilamentSpecs(limbPathD: string, areaId: string, count = 7): HubTrunkFilamentSpec[] {
  if (!limbPathD || limbPathD.length < 8) return [];
  const samples = 30;
  const out: HubTrunkFilamentSpec[] = [];
  for (let fi = 0; fi < count; fi += 1) {
    const side = fi % 2 === 0 ? 1 : -1;
    const mag = (0.95 + hash01(`${areaId}:filMag:${fi}`, 101) * 1.65) * 1.08;
    const pts: Point[] = [];
    for (let i = 0; i < samples; i += 1) {
      const t = i / (samples - 1);
      const p = pathPointAtT(limbPathD, t);
      const tang = pathTangentAtT(limbPathD, t);
      const len = Math.hypot(tang.x, tang.y) || 1;
      const nx = -tang.y / len;
      const ny = tang.x / len;
      const wobble = (hash01(`${areaId}:filW:${fi}:${i}`, i + 17) - 0.5) * 0.42;
      const envelope = 0.35 + 0.65 * Math.sin(t * Math.PI);
      const off = side * mag * envelope * (0.72 + wobble);
      pts.push({ x: p.x + nx * off, y: p.y + ny * off });
    }
    let d = `M${pts[0]!.x.toFixed(2)},${pts[0]!.y.toFixed(2)}`;
    for (let j = 1; j < pts.length; j += 1) {
      d += ` L${pts[j]!.x.toFixed(2)},${pts[j]!.y.toFixed(2)}`;
    }
    out.push({
      key: `${areaId}-hub-fil-${fi}`,
      d,
      strokeWidth: 0.38 + hash01(`${areaId}:filSw:${fi}`, 53) * 0.42,
      strokeOpacity: 0.11 + hash01(`${areaId}:filOp:${fi}`, 29) * 0.14,
    });
  }
  return out;
}
