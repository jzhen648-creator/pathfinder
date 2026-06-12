/** Verify Vercel Cron invocations (`Authorization: Bearer <CRON_SECRET>`). */
export function verifyCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
