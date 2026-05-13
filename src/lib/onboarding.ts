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
    key: "accomplishedGoals",
    question:
      "What have you already achieved that you’re proud of? List a few—education, moves, habits, relationships, career steps, health wins, anything that shaped you. (This helps your life tree start from real roots, not only future plans.)",
    area: "Core",
  },
  {
    key: "lifeNow",
    question: "In one sentence, what does your life look like right now?",
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

  const fallback = `You are ${input.name || "this user"}, with a story that already includes real wins and lived experience—not only plans ahead. You do best with practical momentum, visible progress, and coaching that honours what you've built while shaping your next chapter with clear ambition and real-world constraints.`;

  if (!hasGroqKey()) {
    return fallback;
  }

  try {
    const text = await generateText({
      system:
        "You are an elite life coach. Write a rich, specific profile in second person ('You are...'). Be concrete, non-judgmental, practical, and psychologically insightful. Give real weight to what they have already accomplished (accomplishedGoals)—those are anchors for their story—not only struggles or future ambitions. 2-4 medium paragraphs.",
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
