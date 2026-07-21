import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_EMAIL_DOMAIN,
  anonymousPlaceholderEmail,
  toMobileAuthUser,
} from "./mobile-auth";

describe("mobile-auth anonymous helpers", () => {
  it("builds placeholder emails on the reserved domain", () => {
    expect(anonymousPlaceholderEmail("abc")).toBe(`anon-abc@${ANONYMOUS_EMAIL_DOMAIN}`);
  });

  it("maps isAnonymous onto MobileAuthUser", () => {
    expect(
      toMobileAuthUser({
        id: "u1",
        name: null,
        email: "anon-x@anonymous.invalid",
        onboardingCompleted: false,
        isAnonymous: true,
      }).isAnonymous,
    ).toBe(true);

    expect(
      toMobileAuthUser({
        id: "u2",
        name: "Ada",
        email: "ada@example.com",
        onboardingCompleted: true,
        isAnonymous: false,
      }).isAnonymous,
    ).toBe(false);

    expect(
      toMobileAuthUser({
        id: "u3",
        name: null,
        email: "legacy@example.com",
        onboardingCompleted: true,
      }).isAnonymous,
    ).toBe(false);
  });
});
