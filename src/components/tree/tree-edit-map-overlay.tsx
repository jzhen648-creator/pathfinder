"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { AreaForkSpec } from "./tree-forks";
import { pointyTopHexVertices } from "./tree-goal-visual";
import {
  EDIT_DRAG_THRESHOLD_PX,
  dropTargetLabel,
  dropTargetStyle,
  editDropTargetKey,
  flattenAllGoals,
  hitTestDropTarget,
  type EditDragGoalPayload,
  type EditDropTarget,
} from "./tree-edit-drag";
import { dropTargetToDraftOp, type EditMapDraftOp } from "./tree-edit-map-draft";
import { buildEditMapDropTargets } from "./tree-edit-map-layout";
import { buildEditMapPreviewAreas } from "./tree-edit-map-preview";
import type { AreaLayoutOverride } from "./tree-layout-edit";
import type { AreaData } from "./tree-types";
import { clientToComposeLocalSvg } from "./tree-view-coords";
import { TREE_GOAL_HEX_VERTEX_RADIUS_PX } from "./tree-view-constants";
import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from "./tree-geometry";

type DragPhase =
  | { kind: "idle" }
  | {
      kind: "pending";
      payload: EditDragGoalPayload;
      startClientX: number;
      startClientY: number;
      originX: number;
      originY: number;
    }
  | {
      kind: "dragging";
      payload: EditDragGoalPayload;
      originX: number;
      originY: number;
    };

type TreeEditMapOverlayProps = {
  enabled: boolean;
  areas: AreaData[];
  resolvedForks: Record<string, AreaForkSpec>;
  layoutOverrides: Record<string, AreaLayoutOverride>;
  svgRef: RefObject<SVGSVGElement | null>;
  transform: { x: number; y: number; scale: number };
  onPanMoved: () => void;
  onDraftDrop: (op: EditMapDraftOp, nextAreas: AreaData[]) => void;
  onLayoutPreviewChange?: (preview: AreaData[] | null, draggedGoalId: string | null) => void;
  beginGoalDragRef: MutableRefObject<
    ((payload: EditDragGoalPayload, clientX: number, clientY: number, originX: number, originY: number) => void) | null
  >;
};

function EditDragGhost({ x, y, color }: { x: number; y: number; color: string }) {
  const r = TREE_GOAL_HEX_VERTEX_RADIUS_PX;
  const hex = pointyTopHexVertices(x, y, r, 0)
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
  return (
    <g pointerEvents="none" opacity={0.45}>
      <polygon
        points={hex}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeOpacity={0.7}
      />
    </g>
  );
}

function DropTargetRing({
  target,
  active,
}: {
  target: EditDropTarget;
  active: boolean;
}) {
  const style = dropTargetStyle(target);
  const r = target.radius;
  return (
    <g pointerEvents="none">
      <circle
        cx={target.x}
        cy={target.y}
        r={r + (active && target.kind === "pursuit" ? 4 : 0)}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={active ? 2.5 : 1.5}
        strokeDasharray={style.dash}
        opacity={active ? 1 : target.kind === "hub" ? 0.42 : 0.36}
      />
      {active ? (
        <text
          x={target.x}
          y={target.y - r - 10}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill="rgba(250, 250, 249, 0.95)"
        >
          {dropTargetLabel(target)}
        </text>
      ) : null}
    </g>
  );
}

export function TreeEditMapOverlay({
  enabled,
  areas,
  resolvedForks,
  layoutOverrides,
  svgRef,
  transform,
  onPanMoved,
  onDraftDrop,
  onLayoutPreviewChange,
  beginGoalDragRef,
}: TreeEditMapOverlayProps) {
  const [drag, setDrag] = useState<DragPhase>({ kind: "idle" });
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [hoverTarget, setHoverTarget] = useState<EditDropTarget | null>(null);
  const dragRef = useRef(drag);
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);
  const lastLayoutLiftKeyRef = useRef("");

  const dragPayload = drag.kind === "dragging" ? drag.payload : null;

  const layoutPreview = useMemo(() => {
    if (!enabled || !dragPayload || !hoverTarget) return null;
    return buildEditMapPreviewAreas(areas, dragPayload, hoverTarget);
  }, [areas, dragPayload, enabled, hoverTarget]);

  useEffect(() => {
    if (!enabled) {
      lastLayoutLiftKeyRef.current = "";
      onLayoutPreviewChange?.(null, null);
      return;
    }
    if (drag.kind !== "dragging") {
      lastLayoutLiftKeyRef.current = "";
      onLayoutPreviewChange?.(null, null);
      return;
    }
    const liftKey = `${drag.payload.goalId}|${editDropTargetKey(hoverTarget)}`;
    if (liftKey === lastLayoutLiftKeyRef.current) return;
    lastLayoutLiftKeyRef.current = liftKey;
    onLayoutPreviewChange?.(layoutPreview, layoutPreview ? drag.payload.goalId : null);
  }, [drag, enabled, hoverTarget, layoutPreview, onLayoutPreviewChange]);

  const areasForTargets = layoutPreview ?? areas;
  const allDropTargets = useMemo(
    () => (enabled ? buildEditMapDropTargets(areasForTargets, resolvedForks, layoutOverrides) : []),
    [areasForTargets, enabled, layoutOverrides, resolvedForks],
  );
  const dropTargets = useMemo(() => {
    if (!dragPayload?.parentGoalId) return allDropTargets;
    return allDropTargets
      .filter((t) => t.branchId === dragPayload.branchId)
      .map((t) =>
        t.kind === "hub" ? { ...t, radius: Math.max(t.radius, 64) } : t,
      );
  }, [allDropTargets, dragPayload]);
  const goalsById = useMemo(() => flattenAllGoals(areasForTargets), [areasForTargets]);

  const clientToLocal = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      return clientToComposeLocalSvg(svg, clientX, clientY, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, transform);
    },
    [svgRef, transform],
  );

  const beginGoalDrag = useCallback(
    (payload: EditDragGoalPayload, clientX: number, clientY: number, originX: number, originY: number) => {
      if (!enabled) return;
      setHoverTarget(null);
      lastLayoutLiftKeyRef.current = "";
      setDrag({
        kind: "pending",
        payload,
        startClientX: clientX,
        startClientY: clientY,
        originX,
        originY,
      });
    },
    [enabled],
  );

  useEffect(() => {
    beginGoalDragRef.current = beginGoalDrag;
    return () => {
      beginGoalDragRef.current = null;
    };
  }, [beginGoalDrag, beginGoalDragRef]);

  useEffect(() => {
    if (!enabled) setDrag({ kind: "idle" });
  }, [enabled]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const phase = dragRef.current;
      if (phase.kind === "idle") return;
      const local = clientToLocal(e.clientX, e.clientY);
      if (phase.kind === "pending") {
        const dist = Math.hypot(e.clientX - phase.startClientX, e.clientY - phase.startClientY);
        if (dist < EDIT_DRAG_THRESHOLD_PX) return;
        onPanMoved();
        setPointer({ x: local.x, y: local.y });
        setDrag({
          kind: "dragging",
          payload: phase.payload,
          originX: phase.originX,
          originY: phase.originY,
        });
        return;
      }
      if (phase.kind === "dragging") {
        const hit = hitTestDropTarget(
          dropTargets,
          local.x,
          local.y,
          phase.payload.goalId,
          goalsById,
          phase.payload,
        );
        setPointer({ x: local.x, y: local.y });
        setHoverTarget((prev) => {
          if (editDropTargetKey(prev) === editDropTargetKey(hit)) return prev;
          return hit;
        });
      }
    };

    const onUp = (e: PointerEvent) => {
      const phase = dragRef.current;
      if (phase.kind === "idle") return;
      if (phase.kind === "pending") {
        setDrag({ kind: "idle" });
        return;
      }
      const local = clientToLocal(e.clientX, e.clientY);
      const hit = hitTestDropTarget(
        dropTargets,
        local.x,
        local.y,
        phase.payload.goalId,
        goalsById,
        phase.payload,
      );
      setDrag({ kind: "idle" });
      setHoverTarget(null);
      lastLayoutLiftKeyRef.current = "";
      onLayoutPreviewChange?.(null, null);
      if (!hit) return;
      const nextAreas = buildEditMapPreviewAreas(areas, phase.payload, hit);
      const op = dropTargetToDraftOp(phase.payload, hit, areas);
      if (!nextAreas || !op) return;
      onDraftDrop(op, nextAreas);
    };

    const onCancel = () => {
      setDrag({ kind: "idle" });
      setHoverTarget(null);
      lastLayoutLiftKeyRef.current = "";
      onLayoutPreviewChange?.(null, null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [areas, clientToLocal, dropTargets, goalsById, onDraftDrop, onLayoutPreviewChange, onPanMoved]);

  if (!enabled) return null;

  const dragging = drag.kind === "dragging";
  const payload = dragging ? drag.payload : null;

  return (
    <g data-tree-edit-overlay="1" pointerEvents="none">
      {dragging ? (
        <rect
          x={0}
          y={0}
          width={VIEWBOX_WIDTH}
          height={VIEWBOX_HEIGHT}
          fill="rgba(0,0,0,0.12)"
          pointerEvents="none"
        />
      ) : null}
      {dragging
        ? dropTargets.map((t, i) => (
            <DropTargetRing key={`${t.kind}-${i}`} target={t} active={hoverTarget === t} />
          ))
        : null}
      {dragging && hoverTarget ? (
        <line
          x1={pointer.x}
          y1={pointer.y}
          x2={hoverTarget.x}
          y2={hoverTarget.y}
          stroke={dropTargetStyle(hoverTarget).stroke}
          strokeWidth={2}
          strokeOpacity={0.55}
          strokeDasharray="6 4"
          pointerEvents="none"
        />
      ) : null}
      {dragging && payload ? (
        <EditDragGhost x={pointer.x} y={pointer.y} color={payload.areaColor} />
      ) : null}
    </g>
  );
}
