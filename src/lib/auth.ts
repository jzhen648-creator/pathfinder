import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { AUTH_RATE_LIMITS, consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { isDevLoginAttempt, resolveDevLoginEmail } from "@/lib/dev-login-credentials";
import { prisma } from "@/lib/prisma";

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
      async authorize(credentials, req) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (!email || !password) {
          return null;
        }

        // Shared buckets with /api/auth/mobile-login (same `login:*` keys), so
        // web + mobile draw from one brute-force budget per email and per IP.
        // authorize() cannot return a 429, so a limited attempt reads as
        // invalid credentials.
        const forwarded = req?.headers?.["x-forwarded-for"];
        const ip =
          (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined) ||
          "unknown";
        const ipRate = consumeAuthRateLimit(`login:ip:${ip}`, AUTH_RATE_LIMITS.login);
        if (ipRate.limited) {
          return null;
        }
        const rate = consumeAuthRateLimit(
          `login:email:${email.toLowerCase()}`,
          AUTH_RATE_LIMITS.login,
        );
        if (rate.limited) {
          return null;
        }

        // Normalized like the mobile auth routes; raw-casing fallback covers
        // accounts registered before normalization landed.
        const normalizedEmail = email.trim().toLowerCase();
        const user =
          (await prisma.user.findUnique({ where: { email: normalizedEmail } })) ??
          (email.trim() !== normalizedEmail
            ? await prisma.user.findUnique({ where: { email: email.trim() } })
            : null);

        if (!user || !user.passwordHash || user.isAnonymous) {
          return null;
        }

        let isValid = await bcrypt.compare(password, user.passwordHash);
        if (
          !isValid &&
          isDevLoginAttempt(email, password) &&
          email === resolveDevLoginEmail()
        ) {
          // Accept the dev shortcut WITHOUT persisting: DATABASE_URL may
          // point at a remote database, and rewriting the real account's
          // hash to a password committed in the repo would be destructive.
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
          select: { onboardingCompleted: true },
        });
        token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.onboardingCompleted = token.onboardingCompleted === true;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
