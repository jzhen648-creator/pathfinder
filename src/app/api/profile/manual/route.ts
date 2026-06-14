import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const employmentStatusSchema = z.enum([
  "EMPLOYED",
  "SELF_EMPLOYED",
  "STUDENT",
  "SEEKING_WORK",
  "PREFER_NOT_TO_SAY",
]);

const educationLevelSchema = z.enum(["secondary", "further", "higher"]);

const manualProfileInputSchema = z.object({
  displayName: z.string().trim().max(120).nullable().optional(),
  dateOfBirth: z.string().trim().nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  languages: z.array(z.string().trim().max(80)).max(20).optional(),
  occupation: z.string().trim().max(160).nullable().optional(),
  educationLevel: educationLevelSchema.nullable().optional(),
  employmentStatus: employmentStatusSchema.nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  jobTitle: z.string().trim().max(160).nullable().optional(),
});

type ManualProfileRow = {
  id: string;
  userId: string;
  displayName: string | null;
  dateOfBirth: Date | null;
  location: string | null;
  languages: string[];
  occupation: string | null;
  educationLevel: string | null;
  employmentStatus: string | null;
  industry: string | null;
  jobTitle: string | null;
  updatedAt: Date;
  createdAt: Date;
};

function nullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeLanguages(value: string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const language = raw.trim();
    if (!language) continue;
    const key = language.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(language);
  }
  return out;
}

function parseDateOfBirth(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("dateOfBirth must be a valid ISO date string");
  }
  return date;
}

function serializeManualProfile(profile: ManualProfileRow | null) {
  if (!profile) return {};
  return {
    id: profile.id,
    userId: profile.userId,
    displayName: profile.displayName,
    dateOfBirth: profile.dateOfBirth?.toISOString() ?? null,
    location: profile.location,
    languages: profile.languages,
    occupation: profile.occupation,
    educationLevel: profile.educationLevel,
    employmentStatus: profile.employmentStatus,
    industry: profile.industry,
    jobTitle: profile.jobTitle,
    updatedAt: profile.updatedAt.toISOString(),
    createdAt: profile.createdAt.toISOString(),
  };
}

export async function GET() {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const profile = await prisma.userManualProfile.findUnique({
    where: { userId: auth.userId },
  });

  return NextResponse.json(serializeManualProfile(profile));
}

export async function PUT(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = manualProfileInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  let dateOfBirth: Date | null | undefined;
  try {
    dateOfBirth = parseDateOfBirth(parsed.data.dateOfBirth);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid dateOfBirth";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const jobTitle = nullableText(parsed.data.jobTitle);
  const occupation =
    nullableText(parsed.data.occupation) ?? (jobTitle === undefined ? undefined : jobTitle);

  const data = {
    displayName: nullableText(parsed.data.displayName),
    dateOfBirth,
    location: nullableText(parsed.data.location),
    languages: normalizeLanguages(parsed.data.languages),
    occupation,
    educationLevel: nullableText(parsed.data.educationLevel),
    employmentStatus: nullableText(parsed.data.employmentStatus),
    industry: nullableText(parsed.data.industry),
    jobTitle,
  };

  const profile = await prisma.userManualProfile.upsert({
    where: { userId: auth.userId },
    create: {
      userId: auth.userId,
      displayName: data.displayName ?? null,
      dateOfBirth: data.dateOfBirth ?? null,
      location: data.location ?? null,
      languages: data.languages ?? [],
      occupation: data.occupation ?? null,
      educationLevel: data.educationLevel ?? null,
      employmentStatus: data.employmentStatus ?? null,
      industry: data.industry ?? null,
      jobTitle: data.jobTitle ?? null,
    },
    update: data,
  });

  return NextResponse.json(serializeManualProfile(profile));
}
