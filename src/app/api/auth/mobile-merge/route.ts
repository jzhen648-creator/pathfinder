import { NextResponse } from "next/server";

/**
 * Anonymous V1 map merging depended on the retired Goal/Theme data model.
 * Keep a deliberate compatibility response for installed clients instead of
 * importing the deleted legacy merge implementation or risking partial data
 * transfer into the persisted Almanac model.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Moving an anonymous map into an account is no longer supported. Sign in to your Almanac account instead.",
    },
    { status: 410 },
  );
}
