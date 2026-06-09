import { NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { z } from "zod";

import { authOptions } from "@/lib/auth";

import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";

import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";

import { prisma } from "@/lib/prisma";

import { generateStory, StoryGenerationResponseError } from "@/lib/story/generate-story";

import { isCurrentStoryPayload, storyCacheToPayload } from "@/lib/story/parse-story-cache";

import { TAXONOMY_VERSION } from "@/lib/taxonomy";



const ONE_DAY_MS = 24 * 60 * 60 * 1000;



const refreshBodySchema = z.object({

  force: z.boolean().optional(),

});



async function resolveVersions(userId: string) {

  const [mapVersion, memoryVersion, user] = await Promise.all([

    computeMapVersion(userId),

    getMemoryVersion(userId),

    prisma.user.findUnique({

      where: { id: userId },

      select: { hubTaxonomyVersion: true },

    }),

  ]);

  return {

    mapVersion,

    memoryVersion,

    hubTaxonomyVersion: user?.hubTaxonomyVersion ?? null,

  };

}



function isCacheStale(

  row: { mapVersion: string; memoryVersion: number; payload: string },

  mapVersion: string,

  memoryVersion: number,

  hubTaxonomyVersion: string | null,

): boolean {

  if (row.mapVersion !== mapVersion || row.memoryVersion !== memoryVersion) {

    return true;

  }

  if (hubTaxonomyVersion !== TAXONOMY_VERSION) {

    return true;

  }

  if (!isCurrentStoryPayload(row.payload)) {

    return true;

  }

  return false;

}



function isOlderThanOneDay(generatedAt: Date): boolean {

  return Date.now() - generatedAt.getTime() >= ONE_DAY_MS;

}



export async function GET() {

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  const userId = session.user.id;

  const { mapVersion, memoryVersion, hubTaxonomyVersion } = await resolveVersions(userId);

  const row = await prisma.storyCache.findUnique({ where: { userId } });



  if (!row) {

    return NextResponse.json({ story: null, mapVersion, memoryVersion });

  }



  const stale = isCacheStale(row, mapVersion, memoryVersion, hubTaxonomyVersion);

  const story = storyCacheToPayload(row, stale);

  if (!story) {

    return NextResponse.json({

      story: null,

      stale: true,

      mapVersion,

      memoryVersion,

      canAutoRefresh: true,

    });

  }



  return NextResponse.json({

    story,

    stale,

    generatedAt: row.generatedAt.toISOString(),

    mapVersion,

    memoryVersion,

    canAutoRefresh: stale || isOlderThanOneDay(row.generatedAt),

  });

}



export async function POST(request: Request) {

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  if (!hasGeminiKey()) {

    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });

  }



  let body: unknown = {};

  try {

    const text = await request.text();

    if (text) body = JSON.parse(text);

  } catch {

    return NextResponse.json({ error: "JSON body required" }, { status: 400 });

  }



  const parsedBody = refreshBodySchema.safeParse(body);

  if (!parsedBody.success) {

    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  }



  const userId = session.user.id;

  const force = parsedBody.data.force === true;

  const { mapVersion, memoryVersion, hubTaxonomyVersion } = await resolveVersions(userId);

  const existing = await prisma.storyCache.findUnique({ where: { userId } });



  if (existing && !force) {

    const stale = isCacheStale(existing, mapVersion, memoryVersion, hubTaxonomyVersion);

    const freshEnough = !isOlderThanOneDay(existing.generatedAt);

    if (!stale && freshEnough) {

      const story = storyCacheToPayload(existing, false);

      if (story) {

        return NextResponse.json({

          story,

          stale: false,

          generatedAt: existing.generatedAt.toISOString(),

          refreshed: false,

        });

      }

    }

  }



  try {

    const generated = await generateStory(userId);

    const payloadJson = JSON.stringify(generated);

    const row = await prisma.storyCache.upsert({

      where: { userId },

      create: {

        userId,

        payload: payloadJson,

        mapVersion,

        memoryVersion,

      },

      update: {

        payload: payloadJson,

        generatedAt: new Date(),

        mapVersion,

        memoryVersion,

      },

    });



    const story = storyCacheToPayload(row, false);

    if (!story) {

      return NextResponse.json({ error: "Failed to store story" }, { status: 500 });

    }



    return NextResponse.json({

      story,

      stale: false,

      generatedAt: row.generatedAt.toISOString(),

      refreshed: true,

    });

  } catch (err) {

    if (err instanceof GeminiNotConfiguredError) {

      return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });

    }

    if (err instanceof StoryGenerationResponseError) {

      console.error("[story] generation response rejected", err);

      return NextResponse.json({ error: err.message }, { status: err.status });

    }

    console.error("[story] refresh failed", err);

    const message = err instanceof Error ? err.message : "Story generation failed";

    return NextResponse.json({ error: message }, { status: 500 });

  }

}


