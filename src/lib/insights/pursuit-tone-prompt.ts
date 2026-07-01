import type { PursuitInsightTone } from "@/lib/insights/insight-types";
import {
  resolvePursuitInsightTone,
  type PursuitToneGoalInput,
} from "@/lib/insights/resolve-pursuit-insight-tone";

/** Voice constraints per INSIGHT-TONE-CONTRACT — injected before model writes headline/body. */
export function pursuitToneVoiceLines(tone: PursuitInsightTone): string[] {
  switch (tone) {
    case "arrival":
      return [
        "Tone: arrival — chapter is complete.",
        "Warm, settled acknowledgement only. No hype, fireworks, or coach pressure.",
      ];
    case "worth_a_look":
      return [
        "Tone: worth_a_look — significant chapter, deadline close, no milestone or amount progress yet.",
        "Gentle factual nudge only. Name deadline proximity and no start in tension — never pace judgment, elapsed-time shame, or forecast consequences.",
      ];
    case "paused":
      return [
        "Tone: paused — user deliberately paused this chapter.",
        "Acknowledge the pause warmly. No pressure to resume, no gap framing, no nudge.",
      ];
    case "context":
      return [
        "Tone: context — not enough durable context to interpret deeply.",
        "Understated and honest. Admit thin map signal; invite context — do not invent depth or generic encouragement.",
      ];
    case "in_focus":
    default:
      return [
        "Tone: in_focus — active chapter with enough context for a reflective read.",
        "Even, specific prose. Name concrete facts from map context — no filler or motivational poster language.",
      ];
  }
}

export function formatPursuitToneGuidanceEntry(pursuitId: string, tone: PursuitInsightTone): string {
  return [`${pursuitId}:`, ...pursuitToneVoiceLines(tone).map((line) => `  ${line}`)].join("\n");
}

export function buildPursuitToneGuidanceBlock(
  pursuitIds: string[],
  toneGoals: Map<string, PursuitToneGoalInput>,
  now = Date.now(),
): string | null {
  if (pursuitIds.length === 0) return null;

  const entries = pursuitIds.flatMap((pursuitId) => {
    const goal = toneGoals.get(pursuitId);
    if (!goal) return [];
    const tone = resolvePursuitInsightTone(goal, now);
    return [formatPursuitToneGuidanceEntry(pursuitId, tone)];
  });

  if (entries.length === 0) return null;

  return [
    "<pursuit_tone_guidance>",
    "Server-assigned voice per chapter — match headline/body to the tone below. Do not set a tone field.",
    "",
    ...entries,
    "</pursuit_tone_guidance>",
  ].join("\n");
}
