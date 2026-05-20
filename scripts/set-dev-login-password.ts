/**
 * Set pinned dev account password to DEV_LOGIN_PASSWORD (pathfinder123).
 * Run: npx tsx scripts/set-dev-login-password.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DEV_LOGIN_PASSWORD,
  resolveDevLoginEmail,
} from "../src/lib/dev-login-credentials";

const prisma = new PrismaClient();

async function main() {
  const email = resolveDevLoginEmail();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found: ${email}`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(DEV_LOGIN_PASSWORD, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  console.log(`Updated password for ${email} → ${DEV_LOGIN_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
