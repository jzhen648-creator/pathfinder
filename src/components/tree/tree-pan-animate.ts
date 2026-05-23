import type { TreePanTransform } from "./tree-view-fit";

const STREAM_PAN_DURATION_MS = 300;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Smooth pan/zoom transition for Stream hub focus (ease-out ~300ms). */
export function animateTreePan(
  from: TreePanTransform,
  to: TreePanTransform,
  setTransform: (t: TreePanTransform) => void,
  durationMs = STREAM_PAN_DURATION_MS,
  onComplete?: () => void,
): () => void {
  const start = performance.now();
  let frame = 0;

  const tick = (now: number) => {
    const u = Math.min(1, (now - start) / durationMs);
    const e = easeOutCubic(u);
    setTransform({
      x: from.x + (to.x - from.x) * e,
      y: from.y + (to.y - from.y) * e,
      scale: from.scale + (to.scale - from.scale) * e,
    });
    if (u < 1) {
      frame = requestAnimationFrame(tick);
    } else {
      onComplete?.();
    }
  };

  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/** Pan transform that centres a compose-viewport point in the visible tree strip (left of Stream panel). */
export function panTransformToCenterComposePoint(opts: {
  target: { x: number; y: number };
  viewWidth: number;
  viewHeight: number;
  scale: number;
  visibleCenterX: number;
}): Pick<TreePanTransform, "x" | "y"> {
  const { target, viewWidth, viewHeight, scale, visibleCenterX } = opts;
  return {
    x: visibleCenterX - scale * target.x,
    y: viewHeight / 2 - scale * target.y,
  };
}
