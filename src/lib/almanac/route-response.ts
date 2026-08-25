import { NextResponse } from "next/server";
import {
  AlmanacCapacityError,
  AlmanacConflictError,
  AlmanacNotFoundError,
  AlmanacValidationError,
} from "@/lib/almanac/service";

export function almanacRouteError(error: unknown): NextResponse {
  if (error instanceof AlmanacValidationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  if (error instanceof AlmanacNotFoundError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
  }
  if (error instanceof AlmanacConflictError || error instanceof AlmanacCapacityError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
  }
  console.error("[almanac] Persisted dogfood request failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json(
    { error: "Unable to update Almanac. Please try again." },
    { status: 500 },
  );
}
