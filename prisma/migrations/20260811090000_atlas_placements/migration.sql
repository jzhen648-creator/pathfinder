-- Stable Personal Atlas placement is projection configuration, not life truth.
CREATE TABLE "AtlasPlacement" (
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "focusedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtlasPlacement_pkey" PRIMARY KEY ("goalId"),
    CONSTRAINT "AtlasPlacement_slot_range" CHECK ("slot" >= 0 AND "slot" < 64)
);

CREATE UNIQUE INDEX "AtlasPlacement_userId_slot_key"
ON "AtlasPlacement"("userId", "slot");

CREATE UNIQUE INDEX "AtlasPlacement_goalId_userId_key"
ON "AtlasPlacement"("goalId", "userId");

CREATE INDEX "AtlasPlacement_userId_hiddenAt_idx"
ON "AtlasPlacement"("userId", "hiddenAt");

CREATE UNIQUE INDEX "Goal_id_userId_key"
ON "Goal"("id", "userId");

ALTER TABLE "AtlasPlacement"
ADD CONSTRAINT "AtlasPlacement_goalId_fkey"
FOREIGN KEY ("goalId", "userId") REFERENCES "Goal"("id", "userId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AtlasPlacement"
ADD CONSTRAINT "AtlasPlacement_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
