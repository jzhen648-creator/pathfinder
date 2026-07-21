-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
