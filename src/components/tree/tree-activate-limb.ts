import type { LifeAreaId } from "@/lib/types";

export type ActivateLimbResult = {
  ok: boolean;
  activated: number;
  error?: string;
};

/** Activates all system hubs under a theme via POST /api/branches/activate. */
export async function activateLimbOnServer(limbId: LifeAreaId): Promise<ActivateLimbResult> {
  try {
    const res = await fetch("/api/branches/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limbIds: [limbId] }),
    });
    const data = (await res.json()) as { error?: string; activated?: number };
    if (!res.ok) {
      return { ok: false, activated: 0, error: data.error ?? "Could not add this area." };
    }
    return { ok: true, activated: data.activated ?? 0 };
  } catch {
    return { ok: false, activated: 0, error: "Something went wrong. Please try again." };
  }
}
