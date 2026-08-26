-- Reversible per-Update visibility. Accepted Updates and original responses
-- remain append-only and immutable.
CREATE TABLE "AlmanacUpdatePreference" (
    "updateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlmanacUpdatePreference_pkey" PRIMARY KEY ("updateId")
);
CREATE UNIQUE INDEX "AlmanacUpdatePreference_updateId_userId_key" ON "AlmanacUpdatePreference"("updateId", "userId");
CREATE INDEX "AlmanacUpdatePreference_userId_hiddenAt_idx" ON "AlmanacUpdatePreference"("userId", "hiddenAt");
ALTER TABLE "AlmanacUpdatePreference" ADD CONSTRAINT "AlmanacUpdatePreference_updateId_userId_fkey"
  FOREIGN KEY ("updateId", "userId") REFERENCES "AlmanacUpdate"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacUpdatePreference" ADD CONSTRAINT "AlmanacUpdatePreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacUpdatePreference" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "AlmanacUpdatePreference" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AlmanacUpdatePreference" FROM anon;
REVOKE ALL PRIVILEGES ON TABLE "AlmanacUpdatePreference" FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE "AlmanacUpdatePreference" FROM service_role;
