-- ThemeCategory pursuit-lifecycle column (distinct from BranchStatus `status`).
ALTER TABLE "ThemeCategory" RENAME COLUMN "bloomStatus" TO "lifecycleStatus";
