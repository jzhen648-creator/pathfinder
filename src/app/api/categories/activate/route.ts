import { NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { z } from "zod";

import { authOptions } from "@/lib/auth";

import { prisma } from "@/lib/prisma";

import { activateCategoryForUser } from "@/lib/system-categories";

import { isLifeAreaId, unlockThemesForUser } from "@/lib/unlocked-themes";



const bodySchema = z.object({

  categoryId: z.string().min(1),

});



/** Activate a single taxonomy category row (legacy: activate-hub). */

export async function POST(request: Request) {

  const session = await getServerSession(authOptions);

  const userId = session?.user?.id;

  if (!userId) {

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  let body: unknown;

  try {

    body = await request.json();

  } catch {

    return NextResponse.json({ error: "JSON body required" }, { status: 400 });

  }



  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {

    return NextResponse.json(

      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },

      { status: 400 },

    );

  }



  const category = await prisma.themeCategory.findFirst({

    where: { id: parsed.data.categoryId, userId },

    select: { id: true, themeId: true },

  });

  if (!category) {

    return NextResponse.json({ error: "Category not found." }, { status: 404 });

  }



  if (isLifeAreaId(category.themeId)) {
    await unlockThemesForUser(prisma, userId, [category.themeId]);
  }

  const activated = await activateCategoryForUser(prisma, userId, category.id);

  return NextResponse.json({ activated: activated ? 1 : 0 });

}


