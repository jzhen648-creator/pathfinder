/**
 * Database Seed - Test Accounts
 *
 * Run: npx prisma db seed
 *
 * Creates 4 test accounts (no tree data). For Branch/Mark fixtures use:
 *   npm run seed:tree
 *
 * Password for all accounts: pathfinder123
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding test accounts...");
  const passwordHash = await bcrypt.hash("pathfinder123", 10);

  await prisma.user.upsert({
    where: { email: "test-empty@pathfinder.com" },
    update: {},
    create: {
      email: "test-empty@pathfinder.com",
      name: "Alex",
      passwordHash,
      birthYear: 1995,
      birthPlace: "London, UK",
    },
  });
  console.log("Created empty account: test-empty@pathfinder.com");

  await prisma.user.upsert({
    where: { email: "test-sparse@pathfinder.com" },
    update: {},
    create: {
      email: "test-sparse@pathfinder.com",
      name: "Sam",
      passwordHash,
      birthYear: 1992,
      birthPlace: "Manchester, UK",
    },
  });
  console.log("Created sparse account: test-sparse@pathfinder.com");

  await prisma.user.upsert({
    where: { email: "test-full@pathfinder.com" },
    update: {},
    create: {
      email: "test-full@pathfinder.com",
      name: "Jeremy",
      passwordHash,
      birthYear: 1995,
      birthPlace: "London, UK",
    },
  });
  console.log("Created full account: test-full@pathfinder.com");

  await prisma.user.upsert({
    where: { email: "test-mobile@pathfinder.com" },
    update: {},
    create: {
      email: "test-mobile@pathfinder.com",
      name: "Morgan",
      passwordHash,
      birthYear: 1998,
      birthPlace: "Bristol, UK",
    },
  });
  console.log("Created mobile account: test-mobile@pathfinder.com");

  console.log("");
  console.log("Seeding complete. Empty canvas: npm run seed:tree (mygoals@pathfinder.test / password123).");
  console.log("");
  console.log("Test accounts:");
  console.log("  test-empty@pathfinder.com / pathfinder123");
  console.log("  test-sparse@pathfinder.com / pathfinder123");
  console.log("  test-full@pathfinder.com / pathfinder123");
  console.log("  test-mobile@pathfinder.com / pathfinder123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
