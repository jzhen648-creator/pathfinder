/**
 * HOOK — useViewToggle
 *
 * Reusable map/timeline view toggle helper.
 */

import { useState } from "react";

export function useViewToggle(initialView: "map" | "timeline" = "map") {
  const [activeView, setActiveView] = useState<"map" | "timeline">(initialView);
  return { activeView, setActiveView };
}

