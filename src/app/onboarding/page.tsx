import { redirect } from "next/navigation";
import { WEB_HOME_PATH } from "@/lib/web-landing";

/** Legacy web route — onboarding runs on mobile. */
export default function OnboardingPage() {
  redirect(WEB_HOME_PATH);
}
