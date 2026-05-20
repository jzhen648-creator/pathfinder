"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type MapIssuesCountContextValue = {
  count: number | null;
  setCount: (count: number) => void;
};

const MapIssuesCountContext = createContext<MapIssuesCountContextValue | null>(null);

export function MapIssuesCountProvider({ children }: { children: ReactNode }) {
  const [count, setCountState] = useState<number | null>(null);
  const setCount = useCallback((n: number) => {
    setCountState(n);
  }, []);

  const value = useMemo(() => ({ count, setCount }), [count, setCount]);

  return <MapIssuesCountContext.Provider value={value}>{children}</MapIssuesCountContext.Provider>;
}

export function useMapIssuesCount(): MapIssuesCountContextValue {
  const ctx = useContext(MapIssuesCountContext);
  if (!ctx) {
    return {
      count: null,
      setCount: () => {},
    };
  }
  return ctx;
}
