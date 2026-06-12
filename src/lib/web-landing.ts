/** Production web surface — mobile app is the product; desktop routes are retired. */

export const WEB_HOME_PATH = "/" as const;

const DESKTOP_LEGACY_PREFIXES = [
  "/tree",
  "/dashboard",
  "/finance-tracker",
  "/onboarding",
  "/tasks",
  "/issues",
] as const;

export function isDesktopLegacyWebPath(pathname: string): boolean {
  return DESKTOP_LEGACY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isProductionWeb(): boolean {
  return process.env.NODE_ENV === "production";
}
