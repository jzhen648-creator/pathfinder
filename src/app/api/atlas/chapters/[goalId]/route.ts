import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  AtlasChapterCapacityError,
  AtlasChapterNotFoundError,
  updateAtlasChapterPresentation,
} from "@/lib/atlas/load-atlas";

const patchSchema = z
  .object({
    shown: z.boolean().optional(),
    focused: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.shown !== undefined || value.focused !== undefined);

type AtlasChapterRouteContext = { params: Promise<{ goalId: string }> };

export async function PATCH(
  request: Request,
  context: AtlasChapterRouteContext,
) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid Atlas change." }, { status: 400 });
  }
  const { goalId } = await context.params;
  try {
    return NextResponse.json({
      atlas: await updateAtlasChapterPresentation(auth.userId, goalId, parsed.data),
    });
  } catch (error) {
    if (error instanceof AtlasChapterNotFoundError) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }
    if (error instanceof AtlasChapterCapacityError) {
      return NextResponse.json(
        { error: "This Chapter remains in your Index but the Atlas is full." },
        { status: 409 },
      );
    }
    console.error("[atlas] Failed to update Chapter presentation", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to update your Atlas. Please try again." },
      { status: 500 },
    );
  }
}
