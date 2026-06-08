-- AlterTable: mark.date optional (undated fact marks)
ALTER TABLE "Mark" ALTER COLUMN "date" DROP NOT NULL;
