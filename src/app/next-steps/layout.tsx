import type { Metadata } from "next";
import { DM_Mono, DM_Sans, Lora } from "next/font/google";

const lora = Lora({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-pf-ns-serif",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-pf-ns-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-pf-ns-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Next Steps · Pathfinder",
  description: "Pursuit progress and subtasks across themes",
};

export default function NextStepsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`${lora.variable} ${dmSans.variable} ${dmMono.variable} ${dmSans.className} min-h-dvh`}
      style={{ fontFamily: "var(--font-pf-ns-sans), system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}
