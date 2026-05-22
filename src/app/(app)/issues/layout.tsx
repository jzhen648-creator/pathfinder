import type { Metadata } from "next";
import { DM_Sans, Lora } from "next/font/google";

const lora = Lora({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-pf-roadmap-serif",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-pf-roadmap-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Issues · Pathfinder",
  description: "Data quality and AI uncertainty on your life map",
};

export default function IssuesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`${lora.variable} ${dmSans.variable} ${dmSans.className} h-full min-h-0 overflow-hidden`}
      style={{ fontFamily: "var(--font-pf-roadmap-sans), system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}
