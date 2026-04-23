import { generateText, hasGroqKey } from "@/lib/groq";

export const onboardingQuestions = [
  {
    key: "name",
    question: "What should we call you?",
    area: "Core",
  },
  {
    key: "birthYear",
    question: "When were you born? (year)",
    area: "Core",
  },
  {
    key: "birthPlace",
    question: "Where were you born? (city/country is perfect)",
    area: "Core",
  },
  { key: "age", question: "How old are you?", area: "Core" },
  {
    key: "lifeNow",
    question: "In one sentence, what does your life look like right now?",
    area: "Core",
  },
  {
    key: "mainGoal",
    question: "What is the one thing you most want to achieve right now?",
    area: "Core",
  },
  {
    key: "biggestBlocker",
    question: "What is the biggest thing holding you back?",
    area: "Core",
  },
] as const;

export type OnboardingKey = (typeof onboardingQuestions)[number]["key"];
export type OnboardingAnswers = Partial<Record<OnboardingKey, string>>;

export async function generateProfileFromAnswers(input: {
  name: string;
  answers: OnboardingAnswers;
}) {
  const knownSummary = onboardingQuestions
    .map((q) => `${q.key}: ${input.answers[q.key] ?? "Not provided"}`)
    .join("\n");
  const extraAnswers = Object.entries(input.answers)
    .filter(([key]) => !onboardingQuestions.some((q) => q.key === key))
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  const summaryText = [knownSummary, extraAnswers].filter(Boolean).join("\n");

  const fallback = `You are ${input.name || "this user"}, currently shaping your next chapter with clear ambition and real-world constraints. You do best with practical momentum, visible progress, and coaching that adapts to your motivation style, time limits, and priorities.`;

  if (!hasGroqKey()) {
    return fallback;
  }

  try {
    const text = await generateText({
      system:
        "You are an elite life coach. Write a rich, specific profile in second person ('You are...'). Be concrete, non-judgmental, practical, and psychologically insightful. 2-4 medium paragraphs.",
      messages: [
        {
          role: "user",
          content: `User name: ${input.name}\nAnswers:\n${summaryText}`,
        },
      ],
      maxTokens: 1200,
    });
    return text || fallback;
  } catch (err) {
    console.error("[onboarding] Groq call failed:", err);
    return fallback;
  }
}
