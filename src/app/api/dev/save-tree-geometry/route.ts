import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  parseTreeGeometryDefaultPayload,
  writeTreeGeometryDefaultFile,
  TREE_GEOMETRY_DEFAULT_RELATIVE_PATH,
} from "@/lib/persist-tree-geometry-default";

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = parseTreeGeometryDefaultPayload(body);
  if (payload == null) {
    return NextResponse.json({ error: "Invalid tree geometry payload" }, { status: 400 });
  }

  try {
    const { filePath } = await writeTreeGeometryDefaultFile(payload);
    return NextResponse.json({
      ok: true,
      path: TREE_GEOMETRY_DEFAULT_RELATIVE_PATH,
      filePath,
    });
  } catch (err) {
    console.error("[POST /api/dev/save-tree-geometry] failed", err);
    return NextResponse.json({ error: "Failed to write geometry file" }, { status: 500 });
  }
}
