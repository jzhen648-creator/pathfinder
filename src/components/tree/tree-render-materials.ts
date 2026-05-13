/**
 * Render-layer material helpers only — no fork routing.
 * Vitality / canopy-occupancy fork metadata was removed; `conduitVitalityMaterialFactors` and
 * `canopyOccupancyRhythmMaterialMul` are identity stubs for call-site stability.
 */
import type { DomainHubData } from "./tree-types";

/** Deterministic 0…1 from string id (stable across renders). */
export function stableRenderJitter01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 2 ** 32;
}

/** Uniform stroke material by branch index (no inner/outer luminance falloff). */
export function branchIndexDepthRenderingMul(
  _kFork: number,
  _branchCount: number,
): { strokeWidthMul: number; lineOpacityMul: number; underlayOpacityMul: number } {
  return { strokeWidthMul: 1, lineOpacityMul: 1, underlayOpacityMul: 1 };
}

/** Higher milestone significance → slightly denser thread material (opacity weight, not routing). */
export function threadMomentSignificanceMul(thread: DomainHubData): number {
  const ms = thread.moments;
  if (ms.length === 0) return 1;
  const hi = Math.max(...ms.map((m) => m.significance));
  return 0.97 + 0.08 * Math.min(1, hi / 5);
}

function branchLongitudinalWidthMulAtT(t: number, seed: string, waveAmpMul = 1): number {
  const a = stableRenderJitter01(`${seed}:lw`);
  const w1 = Math.sin(Math.PI * 2 * (0.85 * t + a * 0.11));
  const w2 = Math.sin(Math.PI * 2 * (1.55 * t + a * 0.19));
  const m = 1 + waveAmpMul * (0.028 * w1 + 0.014 * w2);
  return Math.max(0.88, Math.min(1.12, m));
}

/**
 * Averaged subtle width irregularity along a branch (single stroke — no path resampling).
 * `waveAmpMul` > 1 strengthens rhythmic thinning/thickening (tributary intermittency).
 */
export function branchLongitudinalWidthSampleAvg01(seed: string, waveAmpMul = 1): number {
  const a = branchLongitudinalWidthMulAtT(0.22, `${seed}:a`, waveAmpMul);
  const b = branchLongitudinalWidthMulAtT(0.52, `${seed}:b`, waveAmpMul);
  const c = branchLongitudinalWidthMulAtT(0.86, `${seed}:c`, waveAmpMul);
  return (a + b + c) / 3;
}

/** @deprecated Fork vitality removed — returns identity materials. */
export function conduitVitalityMaterialFactors(
  _vit: unknown,
): {
  strokeWidthMul: number;
  lineOpacityMul: number;
  underlayOpacityMul: number;
  longitudinalWaveAmpMul: number;
  catalogTailDashGapMul: number;
} {
  return {
    strokeWidthMul: 1,
    lineOpacityMul: 1,
    underlayOpacityMul: 1,
    longitudinalWaveAmpMul: 1,
    catalogTailDashGapMul: 1,
  };
}

/** @deprecated Fork occupancy rhythm removed — returns identity. */
export function canopyOccupancyRhythmMaterialMul(_presence01: number | undefined): {
  lineOpacityMul: number;
  strokeWidthMul: number;
  catalogTailDashGapMul: number;
} {
  return { lineOpacityMul: 1, strokeWidthMul: 1, catalogTailDashGapMul: 1 };
}

/** Uniform along branch (no distal dimming). */
export function branchDistalCalmOpacityMul01(_t: number): number {
  return 1;
}

/**
 * Long-run pressure variation: calm mid-body + faint breathing (deterministic, low amplitude).
 */
export function branchStrokeOpacityEnvelopeMul01(seed: string): number {
  const o0 = branchDistalCalmOpacityMul01(0.15);
  const o1 = branchDistalCalmOpacityMul01(0.5);
  const o2 = branchDistalCalmOpacityMul01(0.88);
  const base = (o0 + o1 + o2) / 3;
  const wob = 1 + 0.02 * Math.sin(Math.PI * 2 * (stableRenderJitter01(`${seed}:env`) * 0.7 + 0.31));
  const pool = 1 + 0.016 * Math.sin(Math.PI * stableRenderJitter01(`${seed}:pool`));
  return Math.max(0.94, Math.min(1.08, base * wob * pool));
}

/** More timeline stations on a thread → slightly denser conduit material (local, not global glow). */
export function milestoneClusterMaterialMul(momentCount: number): number {
  if (momentCount <= 1) return 1;
  if (momentCount <= 3) return 1 + 0.02 * (momentCount - 1);
  return 1 + 0.04 + 0.01 * (momentCount - 3);
}

/**
 * Localized “pressure” at bole emergence, limb forks, and milestone/goal hubs — opacity/disk bias only.
 */
export function junctionMaterialAccumulation(args: {
  emergenceRelax01: number;
  kFork: number;
  momentCount: number;
  goalCount: number;
}): { coreOpMul: number; underlayOpMul: number; diskOpacityAdd: number; warmFilmOpacity: number } {
  const trunkPack = 0.055 + 0.12 * args.emergenceRelax01;
  const forkPack = args.kFork > 0 ? 0.032 : 0;
  const hubPack = Math.min(
    0.055,
    0.014 * Math.max(0, args.momentCount - 1) + 0.007 * Math.max(0, args.goalCount - 2),
  );
  const pack = Math.min(0.15, trunkPack + forkPack + hubPack);
  return {
    coreOpMul: 1 + pack * 0.48,
    underlayOpMul: 1 + pack * 0.85,
    diskOpacityAdd: pack * 0.12,
    warmFilmOpacity: (0.038 + 0.055 * args.emergenceRelax01) * (1 + forkPack * 1.8),
  };
}

/** Safe fragment for SVG `id` / `url(#…)` (def keys, clipPath, etc.). */
export function svgDefSafeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Longer conduits read slightly calmer mid-opacity (pressure carried, not broadcast). */
export function branchConduitLengthCalmMul01(momentCount: number, goalCount: number): number {
  const len = Math.min(1.15, momentCount * 0.11 + goalCount * 0.085);
  return Math.max(0.96, 1 - 0.035 * len * len);
}

/**
 * Emergence compression + milestone-hub density + significance — multiplies line opacity (not radius).
 */
export function branchConduitPressureOpacityMul(args: {
  emergenceRelax01: number;
  momentCount: number;
  goalCount: number;
  significanceMul: number;
}): number {
  const calm = branchConduitLengthCalmMul01(args.momentCount, args.goalCount);
  const emerge = 1 + 0.05 * args.emergenceRelax01 * args.significanceMul;
  const hub = 1 + 0.014 * Math.max(0, args.momentCount - 1) * args.significanceMul;
  return Math.min(1.18, emerge * hub * calm);
}

/** Occasional slight narrowing on long threads (width only, deterministic). */
export function branchMidRunConstrictionWidthMul(
  seed: string,
  momentCount: number,
  goalCount: number,
): number {
  const len = momentCount + goalCount * 0.55;
  if (len < 3.5) return 1;
  const w = stableRenderJitter01(`${seed}:const`);
  const amp = 0.018 * Math.min(1, (len - 2) / 11);
  return 1 - amp * (0.5 + 0.5 * Math.sin(Math.PI * (0.35 + w * 0.65)));
}
