"use client";

import { useCallback, useEffect, useRef } from "react";

export type UseLongPressOptions = {
  onLongPress: (e: PointerEvent) => void;
  delayMs?: number;
  moveTolerancePx?: number;
};

export type LongPressHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
};

export function useLongPress({
  onLongPress,
  delayMs = 500,
  moveTolerancePx = 4,
}: UseLongPressOptions): LongPressHandlers & { didLongPress: () => boolean } {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const longPressFiredRef = useRef(false);
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearMoveListener = useRef<(() => void) | null>(null);

  const cleanupActive = useCallback(() => {
    clearTimer();
    startRef.current = null;
    clearMoveListener.current?.();
    clearMoveListener.current = null;
  }, [clearTimer]);

  useEffect(() => () => cleanupActive(), [cleanupActive]);

  const didLongPress = useCallback(() => {
    if (!longPressFiredRef.current) return false;
    longPressFiredRef.current = false;
    return true;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      cleanupActive();
      longPressFiredRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };

      const onMove = (ev: PointerEvent) => {
        const start = startRef.current;
        if (!start || ev.pointerId !== start.pointerId) return;
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (Math.hypot(dx, dy) > moveTolerancePx) {
          cleanupActive();
        }
      };

      window.addEventListener("pointermove", onMove);
      clearMoveListener.current = () => window.removeEventListener("pointermove", onMove);

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const start = startRef.current;
        if (!start) return;
        longPressFiredRef.current = true;
        cleanupActive();
        onLongPressRef.current(
          new PointerEvent("pointerup", {
            clientX: start.x,
            clientY: start.y,
            pointerId: start.pointerId,
            bubbles: true,
          }),
        );
      }, delayMs);
    },
    [cleanupActive, delayMs, moveTolerancePx],
  );

  const onPointerUp = useCallback(() => {
    cleanupActive();
  }, [cleanupActive]);

  const onPointerCancel = useCallback(() => {
    cleanupActive();
  }, [cleanupActive]);

  const onPointerLeave = useCallback(() => {
    cleanupActive();
  }, [cleanupActive]);

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    didLongPress,
  };
}
