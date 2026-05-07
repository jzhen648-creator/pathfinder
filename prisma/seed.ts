/**
 * Database Seed - Test Accounts
 *
 * Run: npx prisma db seed
 *
 * Creates 4 test accounts:
 * test-empty@pathfinder.com    - no nodes
 * test-sparse@pathfinder.com   - 3 nodes
 * test-full@pathfinder.com     - full mock data
 * test-mobile@pathfinder.com   - mobile testing
 *
 * Password for all accounts: pathfinder123
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getLegacyMockLifeData } from "../src/data/mock-data";

const prisma = new PrismaClient();

async function upsertNode(userId: string, prefix: string, node: any) {
  await (prisma as any).lifeMapNode.upsert({
    where: { id: `${prefix}-${node.id}` },
    update: {},
    create: {
      id: `${prefix}-${node.id}`,
      userId,
      label: node.label,
      description: node.description,
      branch: node.branch,
      year: node.year,
      month: node.month ?? null,
      future: Boolean(node.future),
      significance: Number(node.significance ?? 1),
      connectedTo: node.connectedTo ?? [],
      practicalData: node.practicalData ?? null,
      timelineNote: null,
    },
  });
}

async function main() {
  console.log("Seeding test accounts...");
  const passwordHash = await bcrypt.hash("pathfinder123", 10);
  const mockLifeData = getLegacyMockLifeData("alex", "extensive");

  const emptyUser = await prisma.user.upsert({
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
  console.log("Created empty account:", emptyUser.email);

  const sparseUser = await prisma.user.upsert({
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

  const sparseNodes = mockLifeData.nodes.slice(0, 3);
  for (const node of sparseNodes) {
    await upsertNode(sparseUser.id, "sparse", node);
  }
  console.log("Created sparse account:", sparseUser.email);

  const fullUser = await prisma.user.upsert({
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
  for (const node of mockLifeData.nodes) {
    await upsertNode(fullUser.id, "full", node);
  }
  console.log("Created full account:", fullUser.email);

  const mobileUser = await prisma.user.upsert({
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
  for (const node of mockLifeData.nodes) {
    await upsertNode(mobileUser.id, "mobile", node);
  }
  console.log("Created mobile account:", mobileUser.email);

  console.log("Seeding complete.");
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

