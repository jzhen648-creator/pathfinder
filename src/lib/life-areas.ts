import type { LifeArea } from "./types";

export const LIFE_AREAS: LifeArea[] = [
  {
    id: "finance",
    label: "Money & Finance",
    sublabel: "Your financial journey",
    color: "#34D399",
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
    color: "#F59E0B",
    angle: -36,
    emptyPrompt: "What do you do and how did you get here?",
    firstMarkQuestion: "What was your first meaningful work or learning turning point?",
    addPrompt: "Add a career pursuit",
    examples: ["First job", "Career pivot", "New role"],
  },
  {
    id: "becoming",
    label: "Who I'm Becoming",
    sublabel: "Purpose, inner life, and joy",
    color: "#A78BFA",
    angle: -2,
    emptyPrompt: "How have you grown and changed?",
    firstMarkQuestion: "What early pursuit most shaped your personal growth?",
    addPrompt: "Add a growth pursuit",
    examples: ["Changed my view on", "Learned that", "Became someone who"],
  },
  {
    id: "people",
    label: "People & Relationships",
    sublabel: "Who has shaped your story",
    color: "#EC4899",
    angle: 34,
    emptyPrompt: "Who has shaped your story?",
    firstMarkQuestion: "Who was the first person or relationship that changed your path?",
    addPrompt: "Add a people & relationships pursuit",
    examples: ["Met my partner", "Found my people", "Lost someone"],
  },
  {
    id: "health",
    label: "Health & Body",
    sublabel: "Physical foundation and daily capacity",
    color: "#10B981",
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
