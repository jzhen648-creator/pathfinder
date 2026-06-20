import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// pdf-parse wraps pdf.js and mammoth uses Node streams — both require the
// Node runtime (not Edge) and should not be webpack-bundled. The
// `serverExternalPackages` entry in next.config.ts handles the bundling side.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB hard cap
const MAX_EXTRACT_CHARS = 15_000;
const MAX_STORED_CHARS = 30_000;

function detectKind(file: File): "pdf" | "docx" | "unsupported" {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (
    type.includes("officedocument.wordprocessingml") ||
    type.includes("msword") ||
    type.includes("word") ||
    name.endsWith(".docx") ||
    name.endsWith(".doc")
  ) {
    return "docx";
  }
  return "unsupported";
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // Dynamic import keeps pdf-parse out of the edge/client graph and lets us
  // surface import-time failures clearly.
  const mod = await import("pdf-parse");
  const PDFParseCtor = (mod as { PDFParse?: new (opts: { data: Buffer }) => { getText(): Promise<{ text?: string }>; destroy(): Promise<void> } }).PDFParse;
  if (!PDFParseCtor) {
    throw new Error("pdf-parse did not export PDFParse; check installed version.");
  }
  const parser = new PDFParseCtor({ data: buffer });
  try {
    const parsed = await parser.getText();
    return parsed.text ?? "";
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mod = await import("mammoth");
  const mammoth = (mod as { default?: typeof import("mammoth") }).default ?? (mod as unknown as typeof import("mammoth"));
  const parsed = await mammoth.extractRawText({ buffer });
  return parsed.value ?? "";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let file: File;
  try {
    const formData = await request.formData();
    const entry = formData.get("file");
    if (!(entry instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    file = entry;
  } catch (err) {
    console.error("[POST /api/profile/documents/extract] formData parse failed:", err);
    return NextResponse.json({ error: "Could not read upload." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File is too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB).` },
      { status: 413 },
    );
  }

  const kind = detectKind(file);
  if (kind === "unsupported") {
    return NextResponse.json(
      { error: "Only PDF and Word (.docx, .doc) files are supported." },
      { status: 400 },
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    console.error("[POST /api/profile/documents/extract] arrayBuffer failed:", err);
    return NextResponse.json({ error: "Could not read file bytes." }, { status: 400 });
  }

  let extractedText = "";
  try {
    extractedText = kind === "pdf" ? await extractPdf(buffer) : await extractDocx(buffer);
  } catch (err) {
    console.error(
      `[POST /api/profile/documents/extract] ${kind} parse failed for "${file.name}":`,
      err,
    );
    const reason =
      err instanceof Error && err.message
        ? err.message
        : "Unknown parser error";
    return NextResponse.json(
      {
        error: `Failed to parse ${kind === "pdf" ? "PDF" : "Word document"}.`,
        detail: reason,
      },
      { status: 422 },
    );
  }

  const trimmed = extractedText.replace(/\u0000/g, "").trim().slice(0, MAX_EXTRACT_CHARS);
  if (!trimmed) {
    return NextResponse.json(
      {
        error:
          "Could not extract any readable text. The file may be image-only (scanned) or password-protected.",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ extractedText: trimmed });
}
