/**
 * Minimum age for Almanac accounts.
 * Keep the mobile DOB picker cap (`ProfileDateOfBirthSheet.MINIMUM_AGE_YEARS`) in sync.
 */
export const MINIMUM_AGE_YEARS = 13;

/**
 * Parse a manual-profile dateOfBirth field.
 * - `undefined` → leave unchanged (passthrough)
 * - `null` / empty → clear
 * - ISO date string → Date, rejecting ages under {@link MINIMUM_AGE_YEARS}
 */
export function parseManualDateOfBirth(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("dateOfBirth must be a valid ISO date string");
  }
  const latestAllowed = new Date();
  latestAllowed.setFullYear(latestAllowed.getFullYear() - MINIMUM_AGE_YEARS);
  if (date.getTime() > latestAllowed.getTime()) {
    throw new Error(`You must be at least ${MINIMUM_AGE_YEARS} years old.`);
  }
  return date;
}
