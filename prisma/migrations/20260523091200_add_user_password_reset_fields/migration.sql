-- Add hashed password reset token storage to users.
ALTER TABLE "User"
  ADD COLUMN "passwordResetToken" TEXT,
  ADD COLUMN "passwordResetExpiry" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");
