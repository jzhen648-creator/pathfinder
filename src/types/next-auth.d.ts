import type { DefaultSession } from "next-auth";

import type { DefaultJWT } from "next-auth/jwt";



declare module "next-auth" {

  interface Session {

    user: {

      id: string;

      onboardingCompleted?: boolean;

      firstRunCompleted?: boolean;

    } & DefaultSession["user"];

  }

}



declare module "next-auth/jwt" {

  interface JWT extends DefaultJWT {

    onboardingCompleted?: boolean;

    firstRunCompleted?: boolean;

  }

}

