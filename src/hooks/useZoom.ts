/**
 * HOOK — useZoom
 *
 * Reusable zoom state helper scaffold.
 */

import { useState } from "react";

export function useZoom(initialZoom = 1) {
  const [zoom, setZoom] = useState(initialZoom);
  return { zoom, setZoom };
}

