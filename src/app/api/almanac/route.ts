import { NextResponse } from "next/server";
import { z } from "zod";
import { eraseAlmanacForUser } from "@/lib/account-data";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import {
  ALMANAC_PERSISTENT_SUGGESTIONS_CAPABILITY,
  almanacUserEntryCapabilityGuard,
  almanacUserEntrySafeJson,
  hasAlmanacCapability,
} from "@/lib/almanac/client-capability";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { loadAlmanacAtlas } from "@/lib/almanac/service";

const eraseSchema = z.object({ confirmation: z.literal("ERASE") });

export async function GET(request: Request) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }
  const capabilityResponse = await almanacUserEntryCapabilityGuard(request, auth.userId);
  if (capabilityResponse) return capabilityResponse;
  try {
    const atlas = await loadAlmanacAtlas(auth.userId);
    const body = hasAlmanacCapability(request, ALMANAC_PERSISTENT_SUGGESTIONS_CAPABILITY)
      ? { atlas }
      : { atlas: legacyAcceptedProjection(atlas) };
    return almanacUserEntrySafeJson(request, auth.userId, body);
  } catch (error) {
    return almanacRouteError(error);
  }
}

function legacyAcceptedProjection(atlas: Awaited<ReturnType<typeof loadAlmanacAtlas>>) {
  const lifecycleImportIds = new Set(atlas.imports.flatMap((imported) => {
    const receipt = imported.receipt as unknown;
    return typeof receipt === "object" && receipt !== null &&
      "mode" in receipt && receipt.mode === "persistent_suggestions"
      ? [imported.id]
      : [];
  }));
  return {
    ...atlas,
    // Older clients cannot truthfully render a staged source or its decisions.
    // They still receive accepted, active Updates with AI_RESPONSE provenance.
    imports: atlas.imports.filter((imported) => !lifecycleImportIds.has(imported.id)),
    updates: atlas.updates.filter((update) =>
      !lifecycleImportIds.has(update.importId) || update.active
    ),
  };
}

export async function DELETE(request: Request) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = eraseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Type "ERASE" to confirm.' }, { status: 400 });
  }

  try {
    await eraseAlmanacForUser(auth.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[erase-almanac]", error);
    return NextResponse.json(
      { error: "Could not erase Almanac right now. Nothing was changed." },
      { status: 500 },
    );
  }
}
