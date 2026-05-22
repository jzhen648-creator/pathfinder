"use client";

import { useCallback, useEffect, useState } from "react";
import { useMapData } from "@/contexts/map-data-context";
import { useMapIssuesCount } from "@/contexts/map-issues-count-context";
import type { MapIssuesSnapshot } from "@/lib/map-issues";

export function useMapIssues() {
  const { setCount } = useMapIssuesCount();
  const { ensureLoaded, refetch: refetchMapData } = useMapData();
  const [snapshot, setSnapshot] = useState<MapIssuesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const readSnapshot = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    const result = force ? await refetchMapData() : await ensureLoaded();
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
  }, [ensureLoaded, refetchMapData, setCount]);

  const refetch = useCallback(async () => {
    await readSnapshot(true);
  }, [readSnapshot]);

  useEffect(() => {
    void readSnapshot();
  }, [readSnapshot]);

  return { snapshot, loading, error, refetch };
}
