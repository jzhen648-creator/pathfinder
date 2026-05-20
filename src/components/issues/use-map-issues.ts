"use client";

import { useCallback, useEffect, useState } from "react";
import { useMapIssuesCount } from "@/contexts/map-issues-count-context";
import { loadMapData } from "@/lib/load-map-data";
import type { MapIssuesSnapshot } from "@/lib/map-issues";

export function useMapIssues() {
  const { setCount } = useMapIssuesCount();
  const [snapshot, setSnapshot] = useState<MapIssuesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadMapData();
    if (!result.ok) {
      setError(result.error);
      setSnapshot(null);
      setCount(0);
      setLoading(false);
      return;
    }
    setSnapshot(result.issues);
    setCount(result.issues.total);
    setLoading(false);
  }, [setCount]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { snapshot, loading, error, refetch };
}
