import { startTransition } from "react";
import type { LoadMapDataResult } from "@/lib/load-map-data";

/** Non-blocking map cache refresh — shared by onboarding and the main app. */
export function prefetchMapDataInBackground(
  refetch: () => Promise<LoadMapDataResult>,
): void {
  startTransition(() => {
    void refetch();
  });
}
