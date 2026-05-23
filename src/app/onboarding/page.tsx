import { redirect } from "next/navigation";

/** Legacy route — onboarding now runs on /tree as overlays. */
export default function OnboardingPage() {
  redirect("/tree");
}
