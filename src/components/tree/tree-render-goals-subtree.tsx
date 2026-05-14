"use client";

import type { MutableRefObject, ReactElement } from "react";
import { FLAGS } from "@/lib/flags";
import {
  limbCoherenceAbsorptionEdgeHex,
  limbJewelHighlightStopColor,
  limbMembraneSparkleStroke,
  limbMidEnergyBandHex,
  limbPetalShadowStopColor,
} from "./tree-color-accents";
import type { TreeRenderQualityFactors } from "./tree-render-quality";
import {
  applyTreeRenderQualityToDerived,
  applyTreeRenderQualityToWholeNode,
  deriveBloomRenderSpec,
  deriveWholeNodeCoherence,
} from "./bloom-render-spec";
import {
  branchAttachVitalityFillOpacity,
  deriveGoalCoherenceField,
  deriveGoalNodeRenderState,
  type GoalCoherenceFieldLayer,
} from "./goal-node-render-phase";
import {
  authorityRenderFactors,
  countGoalSubtreeNodes,
  deriveGoalVisualAuthoritySpec,
  type GoalAuthorityRenderFactors,
} from "./goal-visual-authority";
import { TREE_ORBITAL_MAX_VISIBLE } from "./milestone-tree-projection";
import { goalHexBottomAttach, TreeGoalNodeSvg } from "./tree-goal-visual";
import {
  adaptiveOrbitalVertices,
  goalAdaptiveOrbitalAttach,
  orbitalLayoutRadiusMul,
} from "./tree-orbital-layout";
import type { AreaData, TreeGoalNode } from "./tree-types";
import { TreeElementGuideTag } from "./tree-element-guide-tag";
import { roadmapGoalShowsProgressPulse } from "./tree-view-badges";
import type { PanelState } from "./tree-view-types";
import {
  snapTreeSvgScalar,
  TREE_GOAL_HEX_VERTEX_RADIUS_PX,
  TREE_GOAL_MAX_CHILDREN_PER_NODE,
  TREE_GOAL_RENDER_MAX_DEPTH,
} from "./tree-view-constants";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function lerpRgbStopTriple(
  early: readonly [number, number, number],
  late: readonly [number, number, number],
  t: number,
): readonly [number, number, number] {
  const u = clamp01(t);
  return [
    early[0] + (late[0] - early[0]) * u,
    early[1] + (late[1] - early[1]) * u,
    early[2] + (late[2] - early[2]) * u,
  ] as const;
}

function scaleCoherenceLayer(
  layer: GoalCoherenceFieldLayer,
  q: TreeRenderQualityFactors,
): GoalCoherenceFieldLayer {
  return {
    ...layer,
    rx: layer.rx * q.fieldRadiusMul,
    ry: layer.ry * q.fieldRadiusMul,
    fillOpacity: layer.fillOpacity * q.fieldOpacityMul,
  };
}

/** Tighter atmospheric veil when fewer milestones (organism-sized field, not hex-sized fog). */
function scaleCoherenceLayerEnclosed(
  layer: GoalCoherenceFieldLayer,
  q: TreeRenderQualityFactors,
  enclosureMul: number,
): GoalCoherenceFieldLayer {
  const s = scaleCoherenceLayer(layer, q);
  return {
    ...s,
    rx: s.rx * enclosureMul,
    ry: s.ry * enclosureMul,
  };
}

/** Atmospheric outer veil — significance pulls opacity inward (less diffuse haze). */
function applyAuthorityToCoherenceOuter(
  layer: GoalCoherenceFieldLayer,
  af: GoalAuthorityRenderFactors,
): GoalCoherenceFieldLayer {
  return {
    ...layer,
    rx: layer.rx * af.coherenceEnvelopeMul,
    ry: layer.ry * af.coherenceEnvelopeMul,
    fillOpacity: layer.fillOpacity * af.coherenceDensityMul * af.veilAttenuationMul,
  };
}

/** Inner luminous core — brighter compression, not wider fog. */
function applyAuthorityToCoherenceInner(
  layer: GoalCoherenceFieldLayer,
  af: GoalAuthorityRenderFactors,
): GoalCoherenceFieldLayer {
  return {
    ...layer,
    rx: layer.rx * af.coherenceEnvelopeMul,
    ry: layer.ry * af.coherenceEnvelopeMul,
    fillOpacity: layer.fillOpacity * af.coherenceDensityMul * af.luminousInnerPressureMul,
  };
}

function coherenceFieldEllipse(args: {
  layer: GoalCoherenceFieldLayer;
  gradientId: string;
  hubX: number;
  hubY: number;
  hexRotationRad: number;
  opacityMul: number;
}): ReactElement {
  const ecx = args.hubX + args.layer.cxOffset;
  const ecy = args.hubY + args.layer.cyOffset;
  const rot = (args.hexRotationRad * 180) / Math.PI;
  return (
    <ellipse
      cx={ecx}
      cy={ecy}
      rx={args.layer.rx}
      ry={args.layer.ry}
      fill={`url(#${args.gradientId})`}
      fillOpacity={args.layer.fillOpacity * args.opacityMul}
      transform={`rotate(${rot}, ${ecx}, ${ecy})`}
      pointerEvents="none"
      aria-hidden
    />
  );
}

/** Curved child spoke — cubic ease so joins read botanical, not kinky poly‑lines. */
function childGoalSpokePathD(
  attachX: number,
  attachY: number,
  parentCx: number,
  parentCy: number,
  childX: number,
  childY: number,
): string {
  const ax = snapTreeSvgScalar(attachX);
  const ay = snapTreeSvgScalar(attachY);
  const cx = snapTreeSvgScalar(childX);
  const cy = snapTreeSvgScalar(childY);
  const dx = cx - ax;
  const dy = cy - ay;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const c1x = ax + ux * dist * 0.36 + (parentCx - ax) * 0.15;
  const c1y = ay + uy * dist * 0.36 + (parentCy - ay) * 0.15;
  const c2x = cx - ux * dist * 0.3 + (parentCx - cx) * 0.09;
  const c2y = cy - uy * dist * 0.3 + (parentCy - cy) * 0.09;
  return `M ${ax} ${ay} C ${snapTreeSvgScalar(c1x)},${snapTreeSvgScalar(c1y)} ${snapTreeSvgScalar(c2x)},${snapTreeSvgScalar(c2y)} ${cx} ${cy}`;
}

export function renderGoalsSubtree(
  goal: TreeGoalNode,
  pos: { x: number; y: number },
  area: AreaData,
  areaColor: string,
  panel: PanelState,
  bloomPlayingIds: Set<string>,
  onGoalClick: (g: TreeGoalNode, a: AreaData) => void,
  panMoved: MutableRefObject<boolean>,
  depth: number,
  branchThreadIndex: number,
  showElementGuide: boolean,
  hexRotationRad = 0,
  /** Viewport scale / baseline — biases finest hairlines only; orbitals stay visible at all zooms. */
  zoomRatio = 2.65,
  renderQuality: TreeRenderQualityFactors,
  domainHubPt: { x: number; y: number } | null = null,
) {
  const x = snapTreeSvgScalar(pos.x);
  const y = snapTreeSvgScalar(pos.y);
  const goalSelected = panel.type === "goal" && panel.goal.id === goal.id;
  const orbitals = goal.orbitalMilestones ?? [];
  /** Milestone semantics are always drawn when data exists; selection only boosts micro-detail. */
  const showBloomGeometry = FLAGS.GOAL_MILESTONES && orbitals.length > 0;
  const orbitalDerived = FLAGS.GOAL_MILESTONES
    ? deriveGoalNodeRenderState({
        bloomStatus: goal.bloomStatus,
        orbitalMilestones: orbitals,
      })
    : undefined;
  const visualAuthority = deriveGoalVisualAuthoritySpec({
    goal,
    depth,
    subtreeSize: countGoalSubtreeNodes(goal),
    areaId: area.id,
  });
  const authorityFactors = authorityRenderFactors(visualAuthority.authorityMul);
  const visibleOrbitalCountForLayout =
    orbitalDerived?.visibleOrbitalCount ?? Math.min(TREE_ORBITAL_MAX_VISIBLE, orbitals.length);
  const orbitalR =
    TREE_GOAL_HEX_VERTEX_RADIUS_PX *
    orbitalLayoutRadiusMul(visibleOrbitalCountForLayout) *
    authorityFactors.orbitalSpreadMul;
  const orbitalLayoutVerts =
    showBloomGeometry && visibleOrbitalCountForLayout > 0
      ? adaptiveOrbitalVertices(x, y, orbitalR, visibleOrbitalCountForLayout, hexRotationRad)
      : null;

  const branchAttachWorld =
    FLAGS.GOAL_MILESTONES && showBloomGeometry && orbitalLayoutVerts
      ? goalAdaptiveOrbitalAttach(x, y, orbitalR, visibleOrbitalCountForLayout, hexRotationRad)
      : null;

  const bloomSpec =
    showBloomGeometry && orbitalLayoutVerts
      ? deriveBloomRenderSpec({
          goalId: goal.id,
          bloomStatus: goal.bloomStatus,
          orbitalMilestones: orbitals,
          goalCx: x,
          goalCy: y,
          hexVerts: orbitalLayoutVerts,
          snap: snapTreeSvgScalar,
          renderQuality,
          limbColor: areaColor,
          branchAttachWorld: branchAttachWorld ?? undefined,
          visualAuthority,
        })
      : null;

  const wholeNodeSilhouette =
    !showBloomGeometry &&
    orbitalDerived &&
    orbitalDerived.visibleOrbitalCount > 0 &&
    FLAGS.GOAL_MILESTONES
      ? applyTreeRenderQualityToWholeNode(
          deriveWholeNodeCoherence(
            orbitalDerived.visualPhase,
            orbitalDerived.progress01,
            orbitalDerived.visibleOrbitalCount,
          ),
          renderQuality,
        )
      : undefined;

  const branchOut =
    branchAttachWorld ??
    (FLAGS.GOAL_MILESTONES
      ? goalHexBottomAttach(x, y, TREE_GOAL_HEX_VERTEX_RADIUS_PX, hexRotationRad)
      : { x, y });
  const attachFillOpacityRaw =
    orbitalDerived != null &&
    orbitalDerived.visualPhase !== "ended" &&
    orbitalDerived.completedOrbitalCount > 0 &&
    FLAGS.GOAL_MILESTONES
      ? branchAttachVitalityFillOpacity(
          orbitalDerived.visualPhase,
          orbitalDerived.progress01,
        ) * renderQuality.attachMul
      : 0;
  const attachFillOpacity =
    bloomSpec?.branchAttachFillOpacity ??
    attachFillOpacityRaw * authorityFactors.branchAttachOpacityAuthorityMul;

  /** Selection rewards extra crispness; zoom never hides lifecycle identity. */
  const milestoneDetailMul = goalSelected
    ? 1
    : Math.max(0.82, clamp01((zoomRatio - 1.05) / 0.65));
  const undershapeZoomMul = goalSelected ? 1 : 0.962 + 0.078 * milestoneDetailMul;
  const fieldZoomMul = goalSelected ? 1 : 0.96 + 0.04 * milestoneDetailMul;
  const showPetalFeedCurves = goalSelected || zoomRatio >= 1.35;
  const cfPrefix = `tree-cf-${goal.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const coherenceField =
    FLAGS.GOAL_MILESTONES && orbitalDerived && orbitalDerived.visualPhase !== "ended"
      ? deriveGoalCoherenceField(goal.id, orbitalDerived)
      : null;
  const fieldEnclosureMul =
    orbitalDerived != null && orbitalDerived.visibleOrbitalCount > 0
      ? 0.52 + (orbitalDerived.visibleOrbitalCount / 6) * 0.48
      : 1;
  const coherenceOuterScaled =
    coherenceField?.outer != null
      ? applyAuthorityToCoherenceOuter(
          scaleCoherenceLayerEnclosed(coherenceField.outer, renderQuality, fieldEnclosureMul),
          authorityFactors,
        )
      : null;
  const coherenceInnerScaled =
    coherenceField?.inner != null
      ? applyAuthorityToCoherenceInner(
          scaleCoherenceLayerEnclosed(coherenceField.inner, renderQuality, fieldEnclosureMul),
          authorityFactors,
        )
      : null;
  const fieldOuterGradientRPct = Math.max(
    30,
    Math.round(renderQuality.fieldOuterGradientRPct * authorityFactors.fieldRadialTightnessMul),
  );
  const fieldInnerGradientRPct = Math.max(
    26,
    Math.round(renderQuality.fieldInnerGradientRPct * authorityFactors.fieldRadialTightnessMul),
  );
  const materialChromaLift = renderQuality.petalChromaMix + 0.07;
  const petalMaterialDepthMul = authorityFactors.petalMaterialDepthMul;
  const luminousInnerPressureMul = authorityFactors.luminousInnerPressureMul;
  const veilAttenuationMul = authorityFactors.veilAttenuationMul;
  const hasCoherenceField = Boolean(coherenceOuterScaled ?? coherenceInnerScaled);
  const bloomPhase = bloomSpec?.derived.visualPhase;
  const bloomProgress01 = bloomSpec?.derived.progress01 ?? 0;
  const growingPetalSurfEarly = [0.168, 0.202, 0.276] as const;
  const growingPetalSurfLate = [0.154, 0.192, 0.265] as const;
  const petalSurfStops =
    bloomPhase === "bloomed"
      ? ([0.162, 0.202, 0.284] as const)
      : bloomPhase === "growing"
        ? lerpRgbStopTriple(growingPetalSurfEarly, growingPetalSurfLate, bloomProgress01)
        : ([0.152, 0.186, 0.255] as const);
  const petalOutlineOpacity =
    bloomPhase === "bloomed"
      ? 0.43
      : bloomPhase === "growing"
        ? lerp(0.48, 0.4, bloomProgress01)
        : 0.3;
  const petalOutlineSw =
    bloomPhase === "bloomed"
      ? 0.52
      : bloomPhase === "growing"
        ? lerp(0.6, 0.54, bloomProgress01)
        : 0.38;
  const petalFeedStrokeWidth =
    bloomPhase === "bloomed"
      ? 0.286
      : bloomPhase === "growing"
        ? lerp(0.34, 0.308, bloomProgress01)
        : 0.286;
  const childSpokeOpacity =
    bloomPhase === "bloomed"
      ? 0.812
      : bloomPhase === "growing"
        ? lerp(0.82, 0.784, bloomProgress01)
        : 0.62;
  const childSpokeWidth =
    bloomPhase === "bloomed"
      ? 1.72
      : bloomPhase === "growing"
        ? lerp(1.78, 1.68, bloomProgress01)
        : 1.38;

  const milestonesNodes =
    FLAGS.GOAL_MILESTONES && bloomSpec && bloomSpec.slots.length > 0
      ? bloomSpec.slots.map((slot) => {
          const vp = slot.vertex;
          const petalFillId =
            slot.petalAxialGradient != null
              ? `url(#${bloomSpec.defPrefix}-petalSurf-${slot.vertexIndex})`
              : `url(#${bloomSpec.defPrefix}-petalSurf-fallback)`;
          return (
            <g key={slot.milestoneId}>
              <title>{slot.title}</title>
              {slot.completed && slot.petalPathD ? (
                <>
                  {slot.undershapeGlowFar ? (
                    <circle
                      cx={snapTreeSvgScalar(vp.x)}
                      cy={snapTreeSvgScalar(vp.y)}
                      r={slot.undershapeGlowFar.radiusPx * slot.undershapeGlowFar.radiusMul}
                      fill={areaColor}
                      fillOpacity={
                        slot.undershapeGlowFar.fillOpacity *
                        slot.undershapeGlowFar.opacityMul *
                        undershapeZoomMul
                      }
                      pointerEvents="none"
                    />
                  ) : null}
                  {slot.undershapeGlow ? (
                    <circle
                      cx={snapTreeSvgScalar(vp.x)}
                      cy={snapTreeSvgScalar(vp.y)}
                      r={slot.undershapeGlow.radiusPx * slot.undershapeGlow.radiusMul}
                      fill={areaColor}
                      fillOpacity={
                        slot.undershapeGlow.fillOpacity *
                        slot.undershapeGlow.opacityMul *
                        undershapeZoomMul
                      }
                      pointerEvents="none"
                    />
                  ) : null}
                  {slot.petalJunctionHotspot &&
                  slot.petalJunctionHotspot.fillOpacity > 0.004 ? (
                    <circle
                      cx={snapTreeSvgScalar(slot.petalJunctionHotspot.cx)}
                      cy={snapTreeSvgScalar(slot.petalJunctionHotspot.cy)}
                      r={slot.petalJunctionHotspot.rPx}
                      fill={slot.petalJunctionHotspot.fill}
                      fillOpacity={slot.petalJunctionHotspot.fillOpacity * milestoneDetailMul}
                      stroke={slot.petalJunctionHotspot.stroke ?? "none"}
                      strokeOpacity={
                        (slot.petalJunctionHotspot.strokeOpacity ?? 0) * milestoneDetailMul
                      }
                      strokeWidth={slot.petalJunctionHotspot.strokeWidthPx ?? 0}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  ) : null}
                  {slot.petalStemJewel && slot.petalStemJewel.fillOpacity > 0.004 ? (
                    <circle
                      cx={snapTreeSvgScalar(slot.petalStemJewel.cx)}
                      cy={snapTreeSvgScalar(slot.petalStemJewel.cy)}
                      r={slot.petalStemJewel.rPx}
                      fill={slot.petalStemJewel.fill}
                      fillOpacity={slot.petalStemJewel.fillOpacity * milestoneDetailMul}
                      stroke={slot.petalStemJewel.stroke ?? "none"}
                      strokeOpacity={(slot.petalStemJewel.strokeOpacity ?? 0) * milestoneDetailMul}
                      strokeWidth={slot.petalStemJewel.strokeWidthPx ?? 0}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  ) : null}
                  <path
                    d={slot.petalPathD}
                    fill={petalFillId}
                    stroke={areaColor}
                    strokeOpacity={petalOutlineOpacity}
                    strokeWidth={petalOutlineSw}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                </>
              ) : (
                <circle
                  cx={snapTreeSvgScalar(vp.x)}
                  cy={snapTreeSvgScalar(vp.y)}
                  r={slot.incompleteRingRadius}
                  fill="none"
                  stroke={areaColor}
                  strokeOpacity={slot.incompleteRingStrokeOpacity}
                  strokeWidth={slot.incompleteRingStrokeWidthPx}
                  strokeDasharray={slot.incompleteRingDasharray}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })
      : !FLAGS.GOAL_MILESTONES && goal.milestones.length > 0
        ? goal.milestones.map((m, mi) => {
            const span = Math.max(1, goal.milestones.length);
            const ang = (mi / span) * Math.PI * 1.4 - Math.PI * 0.7;
            const mx = x + Math.cos(ang) * 18;
            const my = y + Math.sin(ang) * 18;
            return (
              <g key={m.id}>
                <title>{m.title}</title>
                <circle cx={mx} cy={my} r={3} fill={areaColor} opacity={0.82} pointerEvents="none" />
              </g>
            );
          })
        : null;

  const visibleChildren =
    depth < TREE_GOAL_RENDER_MAX_DEPTH
      ? goal.childGoals.slice(0, TREE_GOAL_MAX_CHILDREN_PER_NODE)
      : [];

  const childNodes = visibleChildren.map((c, ci) => {
    const n = visibleChildren.length;
    let h = 2166136261;
    for (let k = 0; k < c.id.length; k += 1) {
      h ^= c.id.charCodeAt(k)!;
      h = Math.imul(h, 16777619);
    }
    const lenJitter = (((h >>> 9) % 11) - 5) * 0.95;
    let cpos: { x: number; y: number };
    if (domainHubPt && c.parentGoalId) {
      const dx = x - domainHubPt.x;
      const dy = y - domainHubPt.y;
      const rayLen = Math.hypot(dx, dy) || 1;
      const ux = dx / rayLen;
      const uy = dy / rayLen;
      const perpX = -uy;
      const perpY = ux;
      const side = ci % 2 === 0 ? 1 : -1;
      const along = 62 + ci * 24 + depth * 14 + lenJitter;
      const lateral = side * (10 + ci * 5);
      cpos = {
        x: snapTreeSvgScalar(x + ux * along + perpX * lateral),
        y: snapTreeSvgScalar(y + uy * along + perpY * lateral),
      };
    } else {
      const angJitter = (((h >>> 0) % 19) - 9) * 0.034;
      const ang = (ci / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2 + angJitter + depth * 0.09;
      const len = 54 + depth * 12 + lenJitter;
      cpos = {
        x: snapTreeSvgScalar(x + Math.cos(ang) * len),
        y: snapTreeSvgScalar(y + Math.sin(ang) * len),
      };
    }
    return (
      <g key={c.id}>
        <path
          d={childGoalSpokePathD(branchOut.x, branchOut.y, x, y, cpos.x, cpos.y)}
          fill="none"
          stroke={areaColor}
          strokeWidth={childSpokeWidth}
          opacity={childSpokeOpacity}
          strokeLinecap="round"
          pointerEvents="none"
        />
        {renderGoalsSubtree(
          c,
          cpos,
          area,
          areaColor,
          panel,
          bloomPlayingIds,
          onGoalClick,
          panMoved,
          depth + 1,
          branchThreadIndex,
          showElementGuide,
          0,
          zoomRatio,
          renderQuality,
          domainHubPt,
        )}
      </g>
    );
  });

  return (
    <g>
      {hasCoherenceField || bloomSpec ? (
        <defs>
          {hasCoherenceField ? (
            <>
              <radialGradient
                id={`${cfPrefix}-field-outer`}
                cx="40%"
                cy="38%"
                r={`${fieldOuterGradientRPct}%`}
              >
                <stop
                  offset="0%"
                  stopColor={limbJewelHighlightStopColor(areaColor, 0.2)}
                  stopOpacity={0.1 * renderQuality.fieldGradientPeakMul * veilAttenuationMul}
                />
                <stop
                  offset="24%"
                  stopColor={areaColor}
                  stopOpacity={0.36 * renderQuality.fieldGradientPeakMul * 0.9 * veilAttenuationMul}
                />
                <stop
                  offset="52%"
                  stopColor={limbMidEnergyBandHex(areaColor, materialChromaLift)}
                  stopOpacity={0.15 * renderQuality.fieldGradientPeakMul * veilAttenuationMul}
                />
                <stop
                  offset="78%"
                  stopColor={limbCoherenceAbsorptionEdgeHex(areaColor, 0.38)}
                  stopOpacity={0.07 * veilAttenuationMul}
                />
                <stop
                  offset="100%"
                  stopColor={limbCoherenceAbsorptionEdgeHex(areaColor, 0.82)}
                  stopOpacity={0}
                />
              </radialGradient>
              <radialGradient
                id={`${cfPrefix}-field-inner`}
                cx="44%"
                cy="44%"
                r={`${fieldInnerGradientRPct}%`}
              >
                <stop
                  offset="0%"
                  stopColor={limbJewelHighlightStopColor(areaColor, Math.min(0.44, materialChromaLift + 0.18))}
                  stopOpacity={0.94 * renderQuality.fieldGradientPeakMul * luminousInnerPressureMul}
                />
                <stop
                  offset="20%"
                  stopColor={limbMidEnergyBandHex(areaColor, materialChromaLift)}
                  stopOpacity={0.58 * renderQuality.fieldGradientPeakMul * luminousInnerPressureMul}
                />
                <stop
                  offset="44%"
                  stopColor={areaColor}
                  stopOpacity={0.35 * renderQuality.fieldGradientPeakMul * luminousInnerPressureMul * 0.9}
                />
                <stop
                  offset="68%"
                  stopColor={areaColor}
                  stopOpacity={0.12 * luminousInnerPressureMul}
                />
                <stop
                  offset="88%"
                  stopColor={limbCoherenceAbsorptionEdgeHex(areaColor, 0.5 * petalMaterialDepthMul)}
                  stopOpacity={0.09 * petalMaterialDepthMul}
                />
                <stop
                  offset="100%"
                  stopColor={limbCoherenceAbsorptionEdgeHex(areaColor, 0.88)}
                  stopOpacity={0}
                />
              </radialGradient>
            </>
          ) : null}
          {bloomSpec
            ? bloomSpec.slots.map((slot) =>
                slot.petalAxialGradient ? (
                  <linearGradient
                    key={`petal-surf-${slot.milestoneId}`}
                    id={`${bloomSpec.defPrefix}-petalSurf-${slot.vertexIndex}`}
                    gradientUnits="userSpaceOnUse"
                    x1={slot.petalAxialGradient.x1}
                    y1={slot.petalAxialGradient.y1}
                    x2={slot.petalAxialGradient.x2}
                    y2={slot.petalAxialGradient.y2}
                  >
                    <stop
                      offset="0%"
                      stopColor={areaColor}
                      stopOpacity={
                        petalSurfStops[0] *
                        renderQuality.petalFillOpacityMul *
                        (0.82 + 0.18 * luminousInnerPressureMul)
                      }
                    />
                    {bloomSpec.derived.visualPhase !== "bud" &&
                    bloomSpec.derived.visualPhase !== "ended" ? (
                      <stop
                        offset="5%"
                        stopColor={limbJewelHighlightStopColor(
                          areaColor,
                          Math.min(0.24, renderQuality.petalChromaMix + 0.1),
                        )}
                        stopOpacity={
                          (bloomSpec.derived.visualPhase === "bloomed" ? 0.44 : 0.32) *
                          renderQuality.petalFillOpacityMul *
                          (0.86 + 0.14 * luminousInnerPressureMul)
                        }
                      />
                    ) : null}
                    {renderQuality.petalJewelStopStrength > 0.04 ? (
                      <stop
                        offset="13%"
                        stopColor={limbJewelHighlightStopColor(
                          areaColor,
                          renderQuality.petalChromaMix,
                        )}
                        stopOpacity={
                          (0.52 + renderQuality.petalJewelStopStrength * 0.38) *
                          renderQuality.petalFillOpacityMul *
                          (0.88 + 0.12 * luminousInnerPressureMul)
                        }
                      />
                    ) : null}
                    <stop
                      offset="33%"
                      stopColor={limbMidEnergyBandHex(areaColor, materialChromaLift)}
                      stopOpacity={
                        (petalSurfStops[1] * 1.08) *
                        renderQuality.petalFillOpacityMul *
                        (0.92 + 0.08 * petalMaterialDepthMul)
                      }
                    />
                    <stop
                      offset="44%"
                      stopColor={areaColor}
                      stopOpacity={petalSurfStops[1] * renderQuality.petalFillOpacityMul}
                    />
                    <stop
                      offset="86%"
                      stopColor={limbCoherenceAbsorptionEdgeHex(areaColor, 0.28 * petalMaterialDepthMul)}
                      stopOpacity={
                        petalSurfStops[2] *
                        0.88 *
                        renderQuality.petalFillOpacityMul *
                        (0.9 + 0.1 * petalMaterialDepthMul)
                      }
                    />
                    <stop
                      offset="100%"
                      stopColor={limbPetalShadowStopColor(areaColor, 0.45 + 0.2 * petalMaterialDepthMul)}
                      stopOpacity={Math.min(
                        0.52,
                        petalSurfStops[2] *
                          1.5 *
                          renderQuality.petalFillOpacityMul *
                          petalMaterialDepthMul,
                      )}
                    />
                  </linearGradient>
                ) : null,
              )
            : null}
          {bloomSpec ? (
            <radialGradient id={`${bloomSpec.defPrefix}-petalSurf-fallback`} cx="48%" cy="68%" r="62%">
              <stop offset="0%" stopColor={areaColor} stopOpacity={0.12} />
              <stop offset="100%" stopColor={areaColor} stopOpacity={0.26} />
            </radialGradient>
          ) : null}
        </defs>
      ) : null}
      {bloomSpec && bloomSpec.membranes.length > 0 ? (
        <g pointerEvents="none" aria-hidden>
          {bloomSpec.membranes.map((mem) => (
            <path
              key={`mem-${goal.id}-${mem.ia}-${mem.ib}`}
              d={mem.d}
              fill={areaColor}
              fillOpacity={mem.fillOpacity}
              stroke={
                mem.strokeOpacity > 0.002
                  ? limbMembraneSparkleStroke(areaColor, renderQuality.membraneSparkleMix)
                  : "none"
              }
              strokeOpacity={mem.strokeOpacity}
              strokeWidth={mem.strokeWidthPx}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      ) : null}
      {bloomSpec && bloomSpec.membraneJewels.length > 0 ? (
        <g pointerEvents="none" aria-hidden>
          {bloomSpec.membraneJewels.map((jewel, ji) => (
            <circle
              key={`mem-jewel-${goal.id}-${ji}`}
              cx={snapTreeSvgScalar(jewel.cx)}
              cy={snapTreeSvgScalar(jewel.cy)}
              r={jewel.rPx}
              fill={jewel.fill}
              fillOpacity={jewel.fillOpacity}
              stroke={jewel.stroke ?? "none"}
              strokeOpacity={jewel.strokeOpacity ?? 0}
              strokeWidth={jewel.strokeWidthPx ?? 0}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      ) : null}
      {bloomSpec && bloomSpec.arcs.length > 0 ? (
        <g pointerEvents="none" aria-hidden>
          {bloomSpec.arcs.map((arc) => (
            <path
              key={`arc-${goal.id}-${arc.ia}-${arc.ib}`}
              d={arc.d}
              fill="none"
              stroke={areaColor}
              strokeWidth={arc.strokeWidthPx}
              strokeOpacity={arc.strokeOpacity}
              strokeLinecap="round"
            />
          ))}
        </g>
      ) : null}
      {bloomSpec && showPetalFeedCurves ? (
        <g pointerEvents="none" aria-hidden>
          {bloomSpec.slots.map((slot) =>
            slot.petalFeedPathD && slot.petalFeedStrokeOpacity > 0.008 ? (
              <path
                key={`petal-feed-${goal.id}-${slot.milestoneId}`}
                d={slot.petalFeedPathD}
                fill="none"
                stroke={areaColor}
                strokeOpacity={slot.petalFeedStrokeOpacity * milestoneDetailMul}
                strokeWidth={petalFeedStrokeWidth}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
        </g>
      ) : null}
      {bloomSpec?.branchSpine ? (
        <path
          d={bloomSpec.branchSpine.pathD}
          fill="none"
          stroke={areaColor}
          strokeOpacity={bloomSpec.branchSpine.strokeOpacity}
          strokeWidth={0.3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          aria-hidden
        />
      ) : null}
      <TreeGoalNodeSvg
        cx={x}
        cy={y}
        color={areaColor}
        status={goal.bloomStatus}
        title={goal.title}
        showSurfaceTitle={depth === 0}
        hexRotationRad={hexRotationRad}
        milestoneVisual={
          bloomSpec?.derived ??
          (orbitalDerived != null
            ? applyTreeRenderQualityToDerived(orbitalDerived, renderQuality)
            : undefined)
        }
        bloomWholeNode={bloomSpec?.wholeNode ?? wholeNodeSilhouette}
        organismRingVerts={orbitalLayoutVerts}
        labelAuthorityMul={authorityFactors.labelFontSizeMul}
        pulseGrowing={roadmapGoalShowsProgressPulse(goal.bloomStatus)}
        bloomPlaying={bloomPlayingIds.has(goal.id)}
        selected={goalSelected}
        onClick={() => {
          if (panMoved.current) return;
          onGoalClick(goal, area);
        }}
      />
      {showElementGuide ? <TreeElementGuideTag x={x} y={y - 14} text="roadmap-goal" /> : null}
      {milestonesNodes}
      {attachFillOpacity > 0.002 ? (
        <circle
          cx={snapTreeSvgScalar(branchOut.x)}
          cy={snapTreeSvgScalar(branchOut.y)}
          r={2}
          fill={areaColor}
          fillOpacity={attachFillOpacity}
          pointerEvents="none"
          aria-hidden
        />
      ) : null}
      {childNodes}
    </g>
  );
}
