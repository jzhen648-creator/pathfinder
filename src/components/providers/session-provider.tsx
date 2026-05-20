"use client";

import { SessionProvider } from "next-auth/react";
import { MapIssuesCountProvider } from "@/contexts/map-issues-count-context";

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <MapIssuesCountProvider>{children}</MapIssuesCountProvider>
    </SessionProvider>
  );
}
