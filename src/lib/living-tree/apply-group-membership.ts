import { LivingTreeGroupOrigin, Prisma } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

function normalizedGroupName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

async function firstFreeSlot(transaction: TransactionClient, userId: string): Promise<number | null> {
  const occupied = new Set(
    (
      await transaction.livingTreeGroup.findMany({
        where: { userId, archivedAt: null, slot: { not: null } },
        select: { slot: true },
      })
    ).flatMap((group) => (group.slot === null ? [] : [group.slot])),
  );
  for (let slot = 1; slot <= 5; slot += 1) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}

async function findActiveNamedGroup(
  transaction: TransactionClient,
  userId: string,
  groupName: string,
) {
  const groups = await transaction.livingTreeGroup.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const key = normalizedGroupName(groupName);
  return groups.find((group) => normalizedGroupName(group.name) === key) ?? null;
}

export async function applyLivingTreeGroupMembership(
  transaction: TransactionClient,
  input: {
    userId: string;
    goalId: string;
    applicationId: string;
    groupName: string;
    now: Date;
  },
) {
  const existingEffect = await transaction.livingTreeApplicationEffect.findUnique({
    where: { applicationId: input.applicationId },
    include: { group: true },
  });

  if (existingEffect) {
    if (existingEffect.group.userId !== input.userId) {
      throw new Error("Living Tree application effect has the wrong owner");
    }
    let slot = existingEffect.group.slot;
    if (existingEffect.group.archivedAt) {
      const requestedSlot = existingEffect.groupSlotAtApply;
      const occupied = requestedSlot
        ? await transaction.livingTreeGroup.findFirst({
            where: {
              userId: input.userId,
              archivedAt: null,
              slot: requestedSlot,
              id: { not: existingEffect.groupId },
            },
            select: { id: true },
          })
        : null;
      slot = requestedSlot && !occupied ? requestedSlot : null;
      await transaction.livingTreeGroup.update({
        where: { id: existingEffect.groupId },
        data: { archivedAt: null, lastSlot: null, slot, version: { increment: 1 } },
      });
    }
    await transaction.livingTreeGroupMembership.upsert({
      where: { goalId: input.goalId },
      create: { goalId: input.goalId, groupId: existingEffect.groupId, confirmedAt: input.now },
      update: { groupId: existingEffect.groupId, confirmedAt: input.now },
    });
    await transaction.livingTreeApplicationEffect.update({
      where: { applicationId: input.applicationId },
      data: {
        groupArchivedOnUndo: false,
        groupLastSlotOnUndo: null,
        promotedGroupId: null,
        promotedToSlot: null,
      },
    });
    return { groupId: existingEffect.groupId, groupCreated: existingEffect.groupCreated, slot };
  }

  const name = input.groupName.trim().replace(/\s+/g, " ");
  const existingGroup = await findActiveNamedGroup(transaction, input.userId, name);
  const group =
    existingGroup ??
    (await transaction.livingTreeGroup.create({
      data: {
        userId: input.userId,
        name,
        slot: await firstFreeSlot(transaction, input.userId),
        origin: LivingTreeGroupOrigin.ACCEPTED_CHAPTER,
      },
    }));

  await transaction.livingTreeGroupMembership.upsert({
    where: { goalId: input.goalId },
    create: { goalId: input.goalId, groupId: group.id, confirmedAt: input.now },
    update: { groupId: group.id, confirmedAt: input.now },
  });
  await transaction.livingTreeApplicationEffect.create({
    data: {
      applicationId: input.applicationId,
      groupId: group.id,
      groupCreated: !existingGroup,
      groupSlotAtApply: group.slot,
    },
  });
  return { groupId: group.id, groupCreated: !existingGroup, slot: group.slot };
}

export async function undoLivingTreeGroupMembership(
  transaction: TransactionClient,
  input: { userId: string; goalId: string; applicationId: string; now: Date },
) {
  const effect = await transaction.livingTreeApplicationEffect.findUnique({
    where: { applicationId: input.applicationId },
    include: { group: true },
  });
  if (!effect) return { groupId: null, groupArchived: false };
  if (effect.group.userId !== input.userId) {
    throw new Error("Living Tree application effect has the wrong owner");
  }

  await transaction.livingTreeGroupMembership.deleteMany({
    where: { goalId: input.goalId, groupId: effect.groupId },
  });
  const remaining = await transaction.livingTreeGroupMembership.count({
    where: { groupId: effect.groupId },
  });
  const shouldArchive = effect.groupCreated && remaining === 0 && !effect.group.archivedAt;
  const lastSlot = shouldArchive ? effect.group.slot : null;
  if (shouldArchive) {
    await transaction.livingTreeGroup.update({
      where: { id: effect.groupId },
      data: {
        archivedAt: input.now,
        lastSlot,
        slot: null,
        version: { increment: 1 },
      },
    });
  }
  await transaction.livingTreeApplicationEffect.update({
    where: { applicationId: input.applicationId },
    data: {
      groupArchivedOnUndo: shouldArchive,
      groupLastSlotOnUndo: lastSlot,
      promotedGroupId: null,
      promotedToSlot: null,
    },
  });
  return { groupId: effect.groupId, groupArchived: shouldArchive };
}
