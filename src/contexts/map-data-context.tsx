"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadMapData, type LoadMapDataResult } from "@/lib/load-map-data";

type MapDataContextValue = {
  snapshot: LoadMapDataResult | null;
  loading: boolean;
  ensureLoaded: () => Promise<LoadMapDataResult>;
  refetch: () => Promise<LoadMapDataResult>;
};

const MapDataContext = createContext<MapDataContextValue | null>(null);

export function MapDataProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LoadMapDataResult | null>(null);
  const [loading, setLoading] = useState(false);
  const snapshotRef = useRef<LoadMapDataResult | null>(null);
  const inFlightRef = useRef<Promise<LoadMapDataResult> | null>(null);

  const runLoad = useCallback(async (force: boolean) => {
    if (!force && snapshotRef.current?.ok) {
      return snapshotRef.current;
    }
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    setLoading(true);
    const request = loadMapData()
      .then((result) => {
        snapshotRef.current = result;
        setSnapshot(result);
        return result;
      })
      .finally(() => {
        inFlightRef.current = null;
        setLoading(false);
      });

    inFlightRef.current = request;
    return request;
  }, []);

  const ensureLoaded = useCallback(() => runLoad(false), [runLoad]);
  const refetch = useCallback(() => runLoad(true), [runLoad]);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const value = useMemo(
    () => ({ snapshot, loading, ensureLoaded, refetch }),
    [snapshot, loading, ensureLoaded, refetch],
  );

  return <MapDataContext.Provider value={value}>{children}</MapDataContext.Provider>;
}

export function useMapData(): MapDataContextValue {
  const ctx = useContext(MapDataContext);
  if (!ctx) {
    return {
      snapshot: null,
      loading: false,
      ensureLoaded: loadMapData,
      refetch: loadMapData,
    };
  }
  return ctx;
}
