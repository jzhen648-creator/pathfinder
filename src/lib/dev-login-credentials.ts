/** Default account for the Dev login shortcut. */
export const DEV_LOGIN_EMAIL_DEFAULT = "jzhen648@gmail.com";

/** Shared dev password (prisma seed + Dev login button). */
export const DEV_LOGIN_PASSWORD = "pathfinder123";

export function resolveDevLoginEmail(): string {
  return process.env.NEXT_PUBLIC_DEV_PIN_USER_EMAIL ?? DEV_LOGIN_EMAIL_DEFAULT;
}

export function isDevLoginAttempt(email: string, password: string): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  return email === resolveDevLoginEmail() && password === DEV_LOGIN_PASSWORD;
}
