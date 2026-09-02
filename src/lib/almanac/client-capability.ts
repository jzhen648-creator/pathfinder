import { AlmanacImportScope } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const ALMANAC_CAPABILITIES_HEADER = "x-almanac-capabilities";
export const ALMANAC_USER_ENTRY_CAPABILITY = "user-entry-v1";

function hasUserEntryCapability(request: Request): boolean {
  return (request.headers.get(ALMANAC_CAPABILITIES_HEADER) ?? "")
    .split(",")
    .some((value) => value.trim().toLowerCase() === ALMANAC_USER_ENTRY_CAPABILITY);
}

function upgradeRequiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Update Almanac to view this record.",
      code: "ALMANAC_CLIENT_UPGRADE_REQUIRED",
    },
    { status: 409 },
  );
}

function bodyContainsUserEntryMetadata(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => bodyContainsUserEntryMetadata(item, seen));
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "scope" && child === "direct") return true;
    if (key === "originKind" && child === "USER_ENTRY") return true;
    if (key === "protocolVersion" && child === "ALMANAC/USER/1") return true;
    if (bodyContainsUserEntryMetadata(child, seen)) return true;
  }
  return false;
}

/**
 * Prevents an older client from receiving USER_ENTRY provenance it cannot
 * render truthfully. A direct write always requires the capability; other
 * routes remain backwards compatible until the owner has a direct source.
 */
export async function almanacUserEntryCapabilityGuard(
  request: Request,
  userId: string,
  options: { directWrite?: boolean } = {},
): Promise<NextResponse | null> {
  if (hasUserEntryCapability(request)) return null;
  if (options.directWrite) return upgradeRequiredResponse();

  const directSource = await prisma.almanacImport.findFirst({
    where: { userId, scope: AlmanacImportScope.DIRECT },
    select: { id: true },
  });
  return directSource ? upgradeRequiredResponse() : null;
}

/** Re-check immediately before serialisation so a concurrent first direct
 * source cannot cross a legacy client's response boundary after preflight. */
export async function almanacUserEntrySafeJson(
  request: Request,
  userId: string,
  body: unknown,
  init?: ResponseInit,
): Promise<NextResponse> {
  if (!hasUserEntryCapability(request) && bodyContainsUserEntryMetadata(body)) {
    return upgradeRequiredResponse();
  }
  const capabilityResponse = await almanacUserEntryCapabilityGuard(request, userId);
  return capabilityResponse ?? NextResponse.json(body, init);
}
