import type { LifeAreaId } from "@/lib/types";

export type ActivateLimbResult = {
  ok: boolean;
  activated?: number;
  unlockedLimbIds?: LifeAreaId[];
  error?: string;
};

/** Unlocks a theme on the map without activating its hub rows. */
export async function unlockThemeOnServer(limbId: LifeAreaId): Promise<ActivateLimbResult> {
  try {
    const res = await fetch("/api/branches/unlock-theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limbIds: [limbId] }),
    });
    const data = (await res.json()) as {
      error?: string;
      unlockedLimbIds?: LifeAreaId[];
    };
    if (!res.ok) {
      return { ok: false, error: data.error ?? "Could not add this area." };
    }
    return { ok: true, unlockedLimbIds: data.unlockedLimbIds ?? [limbId] };
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Activates a single hub row (theme must already be unlocked). */
export async function activateHubOnServer(branchId: string): Promise<ActivateLimbResult> {
  try {
    const res = await fetch("/api/branches/activate-hub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId }),
    });
    const data = (await res.json()) as { error?: string; activated?: number };
    if (!res.ok) {
      return { ok: false, error: data.error ?? "Could not open this hub." };
    }
    return { ok: true, activated: data.activated ?? 0 };
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** @deprecated Onboarding — activates every hub under the theme. Prefer {@link unlockThemeOnServer} on the map. */
export async function activateLimbOnServer(limbId: LifeAreaId): Promise<ActivateLimbResult> {
  try {
    const res = await fetch("/api/branches/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limbIds: [limbId] }),
    });
    const data = (await res.json()) as { error?: string; activated?: number };
    if (!res.ok) {
      return { ok: false, error: data.error ?? "Could not add this area." };
    }
    return { ok: true, activated: data.activated ?? 0 };
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
