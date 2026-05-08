import type { LifeArea } from "./types";

export const LIFE_AREAS: LifeArea[] = [
  {
    id: "finance",
    label: "Money",
    sublabel: "Your financial journey",
    color: "#34D399",
    angle: -72,
    emptyPrompt: "How has your financial situation evolved?",
    firstMarkQuestion: "What was the first goal that changed your money story?",
    addPrompt: "Add a financial goal",
    examples: ["First income", "Started saving", "Big financial decision"],
  },
  {
    id: "work",
    label: "Work & Learning",
    sublabel: "Your professional journey",
    color: "#F59E0B",
    angle: -36,
    emptyPrompt: "What do you do and how did you get here?",
    firstMarkQuestion: "What was your first meaningful work or learning turning point?",
    addPrompt: "Add a career goal",
    examples: ["First job", "Career pivot", "New role"],
  },
  {
    id: "becoming",
    label: "Who I'm Becoming",
    sublabel: "Your inner journey",
    color: "#A78BFA",
    angle: -2,
    emptyPrompt: "How have you grown and changed?",
    firstMarkQuestion: "What early goal most shaped your personal growth?",
    addPrompt: "Add a growth goal",
    examples: ["Changed my view on", "Learned that", "Became someone who"],
  },
  {
    id: "people",
    label: "Relationships",
    sublabel: "Who has shaped your story",
    color: "#EC4899",
    angle: 34,
    emptyPrompt: "Who has shaped your story?",
    firstMarkQuestion: "Who was the first person or relationship that changed your path?",
    addPrompt: "Add a relationship goal",
    examples: ["Met my partner", "Found my people", "Lost someone"],
  },
  {
    id: "health",
    label: "Health",
    sublabel: "Your physical journey",
    color: "#10B981",
    angle: 68,
    emptyPrompt: "How has your health evolved?",
    firstMarkQuestion: "What first health goal set the direction you are on today?",
    addPrompt: "Add a health goal",
    examples: ["Started training", "Built a habit", "Health turning point"],
  },
];

export function getLifeArea(id: string): LifeArea | undefined {
  return LIFE_AREAS.find((l) => l.id === id);
}
