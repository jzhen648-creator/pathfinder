import { ghostHubSlotsForArea } from "@/components/tree/tree-node-visual-state";
import { storedTreeToComposeViewport } from "@/components/tree/tree-view-coords";
import type { TreeCameraFrame } from "@/components/tree/tree-view-types";
import { normalizeHubLabelKey } from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";

export type HubCalloutAnchor = {
  slug: string;
  label: string;
  slotIndex: number;
  clientX: number;
  clientY: number;
};

export type HubAnchorInput = {
  label: string;
  slug: string;
};

function composeViewportPointToClient(
  camera: TreeCameraFrame,
  composeX: number,
  composeY: number,
): { clientX: number; clientY: number } {
  const { svg, transform, viewWidth, viewHeight } = camera;
  const vx = composeX * transform.scale + transform.x;
  const vy = composeY * transform.scale + transform.y;
  const rect = svg.getBoundingClientRect();
  return {
    clientX: rect.left + (vx / Math.max(viewWidth, 1)) * Math.max(rect.width, 1),
    clientY: rect.top + (vy / Math.max(viewHeight, 1)) * Math.max(rect.height, 1),
  };
}

/** Map ghost hub geometry to viewport positions for onboarding callout overlays. */
export function resolveOnboardingHubCalloutAnchors(
  themeId: LifeAreaId,
  hubs: HubAnchorInput[],
  camera: TreeCameraFrame | null,
): HubCalloutAnchor[] {
  if (!camera) return [];

  const bySlug = new Map(hubs.map((h) => [h.slug, h]));
  const byLabelKey = new Map(hubs.map((h) => [normalizeHubLabelKey(h.label), h]));
  const ghostSlots = ghostHubSlotsForArea(themeId);

  return ghostSlots.flatMap(({ tip, template, slotIndex }) => {
    const slug = normalizeHubLabelKey(template.name);
    const hub = bySlug.get(slug) ?? byLabelKey.get(slug);
    if (!hub) return [];

    const compose = storedTreeToComposeViewport(tip);
    const { clientX, clientY } = composeViewportPointToClient(camera, compose.x, compose.y);

    return [{ slug, label: hub.label, slotIndex, clientX, clientY }];
  });
}
