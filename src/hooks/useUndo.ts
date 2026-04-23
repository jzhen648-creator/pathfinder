/**
 * HOOK — useUndo
 *
 * Reusable undo helper scaffold.
 */

import { useState } from "react";

export function useUndo<T>() {
  const [history, setHistory] = useState<T[]>([]);
  return { history, setHistory };
}

