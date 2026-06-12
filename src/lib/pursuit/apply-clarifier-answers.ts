import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import {
  enrichAnswersSchema,
  enrichAnswerSchema,
  type EnrichAnswer,
} from "@/lib/pursuit/pursuit-enrich-types";
import { prisma } from "@/lib/prisma";

function parseExistingAnswers(raw: unknown): EnrichAnswer[] {
  const parsed = enrichAnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function appendAnswerLine(description: string, answer: EnrichAnswer): string {
  const line = `${answer.prompt} → ${answer.selectedOption}`;
  const trimmed = description.trim();
  if (!trimmed) return line;
  if (trimmed.includes(line)) return trimmed;
  return `${trimmed}\n${line}`;
}

export async function applyClarifierAnswerForUser(
  userId: string,
  goalId: string,
  input: { clarifierId: string; prompt: string; selectedOption: string },
): Promise<{ enrichAnswers: EnrichAnswer[]; description: string }> {
  const parsed = enrichAnswerSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid clarifier answer");
  }

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true, description: true, enrichAnswers: true },
  });
  if (!goal) {
    throw new Error("Not found");
  }

  const existing = parseExistingAnswers(goal.enrichAnswers);
  const withoutDup = existing.filter((a) => a.clarifierId !== parsed.data.clarifierId);
  const enrichAnswers = [...withoutDup, parsed.data];
  const description = appendAnswerLine(goal.description ?? "", parsed.data);

  await prisma.goal.update({
    where: { id: goalId },
    data: { enrichAnswers, description },
  });

  await markPursuitReadingDirty(userId, goalId, "clarifier_answered");

  return { enrichAnswers, description };
}
