import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const n = await prisma.streamSession.count();
    console.log("StreamSession count:", n);
  } catch (e) {
    console.error("StreamSession error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
