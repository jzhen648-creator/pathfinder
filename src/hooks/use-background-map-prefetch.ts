"use client";

import { useCallback } from "react";
import { useMapData } from "@/contexts/map-data-context";
import { prefetchMapDataInBackground } from "@/lib/prefetch-map-data";

export function useBackgroundMapPrefetch(): () => void {
  const { refetch } = useMapData();

  return useCallback(() => {
    prefetchMapDataInBackground(refetch);
  }, [refetch]);
}
