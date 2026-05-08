"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import { TREE_RENDER_STATS_WINDOW_MS } from "./tree-view-constants";

export function TreeRenderStatsHud({ marksRef }: { marksRef: MutableRefObject<number[]> }) {
  const [rpm, setRpm] = useState(0);
  useEffect(() => {
    const tick = () => {
      if (typeof performance === "undefined") return;
      const nowMs = performance.now();
      marksRef.current = marksRef.current.filter((t) => nowMs - t <= TREE_RENDER_STATS_WINDOW_MS);
      setRpm(marksRef.current.length);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => clearInterval(id);
  }, [marksRef]);
  if (typeof performance === "undefined") return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        top: 10,
        zIndex: 20,
        pointerEvents: "none",
        padding: "5px 9px",
        borderRadius: 8,
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: "#E7E5E4",
        background: "rgba(0,0,0,0.58)",
        border: "1px solid rgba(255,255,255,0.12)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {rpm} renders / min
      <span style={{ opacity: 0.65, fontWeight: 500, marginLeft: 6 }}>(rolling 60s)</span>
    </div>
  );
}
