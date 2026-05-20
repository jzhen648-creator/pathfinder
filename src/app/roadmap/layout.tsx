import type { Metadata } from "next";
import { DM_Mono, DM_Sans, Lora } from "next/font/google";

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

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-pf-roadmap-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Roadmap · Pathfinder",
  description: "Branching timeline of marks and pursuits by theme",
};

export default function RoadmapLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`${lora.variable} ${dmSans.variable} ${dmMono.variable} ${dmSans.className} min-h-dvh`}
      style={{ fontFamily: "var(--font-pf-roadmap-sans), system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}
