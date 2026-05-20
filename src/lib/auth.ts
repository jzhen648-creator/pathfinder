import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import {
  DEV_LOGIN_PASSWORD,
  isDevLoginAttempt,
  resolveDevLoginEmail,
} from "@/lib/dev-login-credentials";
import { prisma } from "@/lib/prisma";

/** In development, session always resolves to this account (overrides JWT sub). */
const DEV_PIN_USER_EMAIL =
  process.env.NODE_ENV === "development"
    ? (process.env.DEV_PIN_USER_EMAIL ?? null)
    : null;

async function getDevPinnedUser() {
  if (!DEV_PIN_USER_EMAIL) return null;
  return prisma.user.findUnique({
    where: { email: DEV_PIN_USER_EMAIL },
    select: {
      id: true,
      name: true,
      email: true,
      onboardingCompleted: true,
      firstRunCompleted: true,
    },
  });
}

/** Keep JWT (middleware) aligned with session (server components) in development. */
async function applyDevJwtPin(token: {
  sub?: string;
  onboardingCompleted?: boolean;
  firstRunCompleted?: boolean;
}) {
  const pinned = await getDevPinnedUser();
  if (!pinned) return;
  token.sub = pinned.id;
  token.onboardingCompleted = pinned.onboardingCompleted;
  token.firstRunCompleted = pinned.firstRunCompleted;
}

async function applyDevSessionPin(session: {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    onboardingCompleted?: boolean;
    firstRunCompleted?: boolean;
  };
}) {
  if (!session.user) return;
  const pinned = await getDevPinnedUser();
  if (!pinned) return;
  session.user.id = pinned.id;
  session.user.name = pinned.name;
  session.user.email = pinned.email;
  session.user.onboardingCompleted = pinned.onboardingCompleted;
  session.user.firstRunCompleted = pinned.firstRunCompleted;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (!email || !password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          return null;
        }

        let isValid = await bcrypt.compare(password, user.passwordHash);
        if (
          !isValid &&
          isDevLoginAttempt(email, password) &&
          email === resolveDevLoginEmail()
        ) {
          const passwordHash = await bcrypt.hash(DEV_LOGIN_PASSWORD, 12);
          await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash },
          });
          isValid = true;
        }

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          onboardingCompleted: user.onboardingCompleted,
          firstRunCompleted: user.firstRunCompleted,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      const userId = token.sub;
      if (userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { onboardingCompleted: true, firstRunCompleted: true },
        });
        token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
        token.firstRunCompleted = dbUser?.firstRunCompleted ?? false;
      }
      await applyDevJwtPin(token);
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.onboardingCompleted = token.onboardingCompleted === true;
        session.user.firstRunCompleted = token.firstRunCompleted === true;
        await applyDevSessionPin(session);
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
