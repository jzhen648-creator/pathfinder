import bcrypt from "bcryptjs";

import { DUMMY_BCRYPT_HASH } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export class AccountPasswordError extends Error {
  constructor() {
    super("Your password was not accepted.");
    this.name = "AccountPasswordError";
  }
}

/**
 * Removes only the current Almanac record. Login credentials and unrelated
 * legacy rows remain untouched. The order clears explicit NoAction links
 * before their parent rows; the transaction makes the operation all-or-none.
 */
export async function eraseAlmanacForUser(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.almanacUpdatePreference.deleteMany({ where: { userId } });
    await tx.almanacSubjectPreference.deleteMany({ where: { userId } });
    await tx.almanacUpdate.deleteMany({ where: { userId } });
    await tx.almanacImport.deleteMany({ where: { userId } });
    await tx.almanacPlace.deleteMany({ where: { userId } });
  });
}

/** Verifies the current password, then deletes the User and all cascaded data. */
export async function deleteAccountForUser(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, isAnonymous: true },
  });

  const passwordHash = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
  const valid = await bcrypt.compare(password, passwordHash);
  if (!user || user.isAnonymous || !user.passwordHash || !valid) {
    throw new AccountPasswordError();
  }

  await prisma.user.delete({ where: { id: user.id } });
}
