"use client";

import { useCallback, useEffect, useState } from "react";
import { TasksShell } from "@/components/next-steps/next-steps-shell";
import { useMapData } from "@/contexts/map-data-context";

export default function TasksPage() {
  const { snapshot, ensureLoaded, refetch } = useMapData();
  const [error, setError] = useState<string | null>(null);

  const retry = useCallback(async () => {
    setError(null);
    const result = await refetch();
    setError(result.ok ? null : result.error);
  }, [refetch]);

  useEffect(() => {
    if (snapshot?.ok) {
      setError(null);
      return;
    }
    let cancelled = false;
    void ensureLoaded().then((result) => {
      if (cancelled) return;
      setError(result.ok ? null : result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [ensureLoaded, snapshot]);

  return (
    <TasksShell
      areas={snapshot?.ok ? snapshot.areas : []}
      loading={!snapshot?.ok && error == null}
      error={error}
      onRetry={retry}
    />
  );
}
