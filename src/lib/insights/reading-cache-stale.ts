/** Map or memory drift — the only client signal for "changes waiting" (manual-primary UX). */
export function isReadingDrift(
  row: { mapVersion: string; memoryVersion: number },
  mapVersion: string,
  memoryVersion: number,
): boolean {
  return row.mapVersion !== mapVersion || row.memoryVersion !== memoryVersion;
}
