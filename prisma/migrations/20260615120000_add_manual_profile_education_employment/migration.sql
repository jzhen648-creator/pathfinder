-- AlterTable
ALTER TABLE "UserManualProfile" ADD COLUMN IF NOT EXISTS "educationLevel" TEXT;
ALTER TABLE "UserManualProfile" ADD COLUMN IF NOT EXISTS "employmentStatus" TEXT;
ALTER TABLE "UserManualProfile" ADD COLUMN IF NOT EXISTS "industry" TEXT;
ALTER TABLE "UserManualProfile" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
