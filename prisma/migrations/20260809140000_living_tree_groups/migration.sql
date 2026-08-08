-- Living Tree group projection configuration.
--
-- A group organises how the confirmed model is displayed. It is not a life
-- fact, chapter, theme or relationship. Nothing here carries meaning.
--
-- LivingTreeGroupMembership deliberately has no "userId". Ownership derives
-- from the chapter, so an account merge moves nothing in this table and cannot
-- strand or mis-own a row. Two composite owner keys on one row are unsatisfiable
-- in any statement order, which is why that shape is avoided rather than
-- deferred. A trigger keeps chapter and group owners aligned.

-- CreateEnum
CREATE TYPE "LivingTreeGroupOrigin" AS ENUM ('BOOTSTRAP', 'ACCEPTED_CHAPTER');

-- CreateTable
CREATE TABLE "LivingTreeGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slot" INTEGER,
    "lastSlot" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "origin" "LivingTreeGroupOrigin" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LivingTreeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivingTreeGroupMembership" (
    "goalId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivingTreeGroupMembership_pkey" PRIMARY KEY ("goalId")
);

-- CreateTable
CREATE TABLE "LivingTreeApplicationEffect" (
    "applicationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupCreated" BOOLEAN NOT NULL DEFAULT false,
    "groupSlotAtApply" INTEGER,
    "groupArchivedOnUndo" BOOLEAN NOT NULL DEFAULT false,
    "groupLastSlotOnUndo" INTEGER,
    "promotedGroupId" TEXT,
    "promotedToSlot" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LivingTreeApplicationEffect_pkey" PRIMARY KEY ("applicationId")
);

-- CreateIndex
CREATE INDEX "LivingTreeGroup_userId_archivedAt_idx" ON "LivingTreeGroup"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "LivingTreeGroupMembership_groupId_idx" ON "LivingTreeGroupMembership"("groupId");

-- CreateIndex
CREATE INDEX "LivingTreeApplicationEffect_groupId_idx" ON "LivingTreeApplicationEffect"("groupId");

-- AddForeignKey
ALTER TABLE "LivingTreeGroup" ADD CONSTRAINT "LivingTreeGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivingTreeGroupMembership" ADD CONSTRAINT "LivingTreeGroupMembership_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivingTreeGroupMembership" ADD CONSTRAINT "LivingTreeGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LivingTreeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivingTreeApplicationEffect" ADD CONSTRAINT "LivingTreeApplicationEffect_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ImportProposalApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivingTreeApplicationEffect" ADD CONSTRAINT "LivingTreeApplicationEffect_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LivingTreeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivingTreeApplicationEffect" ADD CONSTRAINT "LivingTreeApplicationEffect_promotedGroupId_fkey" FOREIGN KEY ("promotedGroupId") REFERENCES "LivingTreeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Slot rules. Prisma cannot express CHECK constraints or partial unique
-- indexes, so they live here and must not be treated as schema drift.

ALTER TABLE "LivingTreeGroup"
    ADD CONSTRAINT "LivingTreeGroup_slot_range"
    CHECK ("slot" IS NULL OR ("slot" >= 1 AND "slot" <= 5));

ALTER TABLE "LivingTreeGroup"
    ADD CONSTRAINT "LivingTreeGroup_last_slot_range"
    CHECK ("lastSlot" IS NULL OR ("lastSlot" >= 1 AND "lastSlot" <= 5));

-- An archived group never holds a visible slot; it records lastSlot instead.
ALTER TABLE "LivingTreeGroup"
    ADD CONSTRAINT "LivingTreeGroup_archived_has_no_slot"
    CHECK ("archivedAt" IS NULL OR "slot" IS NULL);

-- One group per visible slot per user. Overflow and archived groups hold NULL
-- and are therefore unconstrained.
CREATE UNIQUE INDEX "LivingTreeGroup_userId_slot_key"
    ON "LivingTreeGroup"("userId", "slot") WHERE "slot" IS NOT NULL;

ALTER TABLE "LivingTreeApplicationEffect"
    ADD CONSTRAINT "LivingTreeApplicationEffect_promotion_pairs"
    CHECK (("promotedGroupId" IS NULL) = ("promotedToSlot" IS NULL));

ALTER TABLE "LivingTreeApplicationEffect"
    ADD CONSTRAINT "LivingTreeApplicationEffect_undo_slot_guard"
    CHECK ("groupArchivedOnUndo" OR "groupLastSlotOnUndo" IS NULL);

-- Owner consistency. A CHECK cannot use a subquery, so a trigger enforces that
-- a chapter is only ever placed in a group belonging to the same person.
CREATE OR REPLACE FUNCTION "living_tree_membership_same_owner"() RETURNS trigger AS $fn$
BEGIN
    IF (SELECT g."userId" FROM "Goal" g WHERE g."id" = NEW."goalId")
       IS DISTINCT FROM
       (SELECT lg."userId" FROM "LivingTreeGroup" lg WHERE lg."id" = NEW."groupId")
    THEN
        RAISE EXCEPTION 'Living Tree membership would cross accounts';
    END IF;
    RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER "living_tree_membership_same_owner_trg"
    BEFORE INSERT OR UPDATE ON "LivingTreeGroupMembership"
    FOR EACH ROW EXECUTE FUNCTION "living_tree_membership_same_owner"();

-- The app server is the only access path.
ALTER TABLE "LivingTreeGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LivingTreeGroupMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LivingTreeApplicationEffect" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "LivingTreeGroup", "LivingTreeGroupMembership", "LivingTreeApplicationEffect" FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "LivingTreeGroup", "LivingTreeGroupMembership", "LivingTreeApplicationEffect" FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "LivingTreeGroup", "LivingTreeGroupMembership", "LivingTreeApplicationEffect" FROM authenticated';
    END IF;
END
$$;
