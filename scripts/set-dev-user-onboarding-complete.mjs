import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = process.env.DEV_PIN_USER_EMAIL ?? "jzhen648@gmail.com";

const user = await prisma.user.update({
  where: { email },
  data: { onboardingCompleted: true },
  select: { email: true, onboardingCompleted: true },
});
console.log("Updated:", user);
await prisma.$disconnect();
