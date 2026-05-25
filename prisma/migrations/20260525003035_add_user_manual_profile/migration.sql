-- CreateTable
CREATE TABLE "UserManualProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "location" TEXT,
    "languages" TEXT[],
    "occupation" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserManualProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserManualProfile_userId_key" ON "UserManualProfile"("userId");

-- AddForeignKey
ALTER TABLE "UserManualProfile" ADD CONSTRAINT "UserManualProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
