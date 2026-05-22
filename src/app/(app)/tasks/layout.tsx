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
  title: "Tasks · Pathfinder",
  description: "Pursuit progress and tasks across themes",
};

export default function TasksLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`${lora.variable} ${dmSans.variable} ${dmMono.variable} ${dmSans.className} h-full min-h-0 overflow-hidden`}
      style={{ fontFamily: "var(--font-pf-ns-sans), system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}
