export function resolveDevLoginEmail(): string {
  return process.env.DEV_LOGIN_EMAIL?.trim() ?? "";
}

export function isDevLoginAttempt(email: string, password: string): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const configuredEmail = resolveDevLoginEmail();
  const configuredPassword = process.env.DEV_LOGIN_PASSWORD ?? "";
  if (!configuredEmail || !configuredPassword) return false;
  return email === configuredEmail && password === configuredPassword;
}
