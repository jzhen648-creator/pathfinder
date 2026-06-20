import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import {
  DEV_LOGIN_PASSWORD,
  isDevLoginAttempt,
  resolveDevLoginEmail,
} from "@/lib/dev-login-credentials";
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
