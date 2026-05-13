/** One-off: verify SQLite Milestone columns vs Prisma expectations. */
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info("Milestone")`);
    console.dir(rows, { depth: null });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
