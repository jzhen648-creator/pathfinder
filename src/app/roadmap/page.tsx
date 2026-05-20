import { RoadmapShell } from "@/components/roadmap/roadmap-shell";
import { requireOnboardingComplete } from "@/lib/onboarding-gate";

export default async function RoadmapPage() {
  await requireOnboardingComplete();
  return <RoadmapShell />;
}
