import { expect, type Page } from "@playwright/test";

export const MANDELA_EMAIL = "nelson.mandela@pathfinder.test";
export const MANDELA_PASSWORD = "password123";

export async function loginMandela(page: Page): Promise<void> {
  const csrfRes = await page.request.get("/api/auth/csrf");
  expect(csrfRes.ok()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  expect(csrfToken).toBeTruthy();

  const signInRes = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrfToken!,
      email: MANDELA_EMAIL,
      password: MANDELA_PASSWORD,
      redirect: "false",
      json: "true",
    },
  });
  const signInBody = (await signInRes.json().catch(() => ({}))) as { error?: string };
  expect(signInBody.error).toBeUndefined();

  const sessionRes = await page.request.get("/api/auth/session");
  const session = (await sessionRes.json()) as { user?: { email?: string } };
  expect(session.user?.email).toBe(MANDELA_EMAIL);
}
