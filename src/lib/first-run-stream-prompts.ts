import type { LifeAreaId } from "@/lib/types";

const FIRST_RUN_STREAM_PROMPTS: Record<LifeAreaId, string> = {
  work: "What's been happening in your work life lately?",
  finance: "What's been happening with your money lately?",
  becoming: "What's been shaping who you're becoming lately?",
  people: "What's been happening in your relationships lately?",
  health: "How has your body and health been lately?",
};

/** Starter brain-dump for post-onboarding theme Stream (composer prefill only). */
export function getFirstRunStreamPrompt(limbId: LifeAreaId): string {
  return FIRST_RUN_STREAM_PROMPTS[limbId];
}
