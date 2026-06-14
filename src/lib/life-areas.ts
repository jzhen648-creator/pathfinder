import type { LifeArea } from "./types";

export const LIFE_AREAS: LifeArea[] = [
  {
    id: "finance",
    label: "Money & Finance",
    sublabel: "Your financial journey",
    color: "#1D9E75",
    angle: -72,
    emptyPrompt: "How has your financial situation evolved?",
    firstMarkQuestion: "What was the first pursuit that changed your money story?",
    addPrompt: "Add a money & finance pursuit",
    examples: ["First income", "Started saving", "Big financial decision"],
  },
  {
    id: "work",
    label: "Work & Career",
    sublabel: "Your professional journey",
    color: "#D4A12A",
    angle: -36,
    emptyPrompt: "What do you do and how did you get here?",
    firstMarkQuestion: "What was your first meaningful work or learning turning point?",
    addPrompt: "Add a career pursuit",
    examples: ["First job", "Career pivot", "New role"],
  },
  {
    id: "becoming",
    label: "Self & Mind",
    sublabel: "Purpose & values, mind & emotions",
    color: "#7F77DD",
    angle: -2,
    emptyPrompt: "What matters to you beyond work, money, health, and other people?",
    firstMarkQuestion: "What early pursuit most shaped who you are becoming?",
    addPrompt: "Add a self & mind pursuit",
    examples: ["Changed my view on", "Learned that", "Became someone who"],
  },
  {
    id: "pleasures",
    label: "Play & Leisure",
    sublabel: "Hobbies, culture, and experiences for joy",
    color: "#FF9F6B",
    angle: 18,
    emptyPrompt: "What do you do for fun — and what have you been missing?",
    firstMarkQuestion: "What pursuit first made play a real part of your life?",
    addPrompt: "Add a play & leisure pursuit",
    examples: ["Started a hobby", "Planned a trip", "Made time for fun"],
  },
  {
    id: "people",
    label: "People & Relationships",
    sublabel: "Who has shaped your story",
    color: "#D4537E",
    angle: 34,
    emptyPrompt: "Who has shaped your story?",
    firstMarkQuestion: "Who was the first person or relationship that changed your path?",
    addPrompt: "Add a connection",
    examples: ["Met my partner", "Found my people", "Lost someone"],
  },
  {
    id: "health",
    label: "Health & Body",
    sublabel: "Physical foundation and daily capacity",
    color: "#D85A30",
    angle: 68,
    emptyPrompt: "How is your body holding up?",
    firstMarkQuestion: "What first physical pursuit set the direction you are on today?",
    addPrompt: "Add a health & body pursuit",
    examples: ["Started training", "Fixed my sleep", "Stabilised energy"],
  },
];

export function getLifeArea(id: string): LifeArea | undefined {
  return LIFE_AREAS.find((l) => l.id === id);
}

/** Retired theme display names for id `becoming` — never use in AI/UI copy. */
const LEGACY_BECOMING_THEME_LABELS = [
  "Who I'm Becoming",
  "Who I'm becoming",
  "Who Im Becoming",
  "Who im becoming",
  "Mind & Spirit",
  "Personal Growth",
] as const;

const WHO_IM_BECOMING_RE =
  /\bwho\s+i['\u2019]?m\s+becoming\b|\bwho\s+im\s+becoming\b/gi;

/** Rewrite legacy theme names in AI-generated prose (Story, insights, etc.). */
export function sanitizeThemeLabelsInText(text: string): string {
  let out = text;
  for (const legacy of LEGACY_BECOMING_THEME_LABELS) {
    if (out.includes(legacy)) {
      out = out.split(legacy).join("Self & Mind");
    }
  }
  return out.replace(WHO_IM_BECOMING_RE, "Self & Mind");
}

/** Theme id → display label block for LLM prompts. */
export function formatThemeDisplayNamesForPrompt(): string {
  return LIFE_AREAS.map((a) => `- ${a.id} → ${a.label}`).join("\n");
}
