import Groq from "groq-sdk";

export const GROQ_MODEL = "llama-3.3-70b-versatile";

export class GroqNotConfiguredError extends Error {
  constructor() {
    super("GROQ_API_KEY is not configured.");
    this.name = "GroqNotConfiguredError";
  }
}

export function hasGroqKey() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new GroqNotConfiguredError();
  return new Groq({ apiKey });
}

type TextMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function generateText(input: {
  system: string;
  messages: TextMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const client = getGroqClient();
  const completion = await client.chat.completions.create({
    model: GROQ_MODEL,
    temperature: input.temperature ?? 0.7,
    max_tokens: input.maxTokens ?? 1024,
    messages: [
      { role: "system", content: input.system },
      ...input.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

export async function generateJsonCompletion(input: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const client = getGroqClient();
  const completion = await client.chat.completions.create({
    model: GROQ_MODEL,
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

export async function generateStructured<T = unknown>(input: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const client = getGroqClient();

  const completion = await client.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.2,
    max_tokens: input.maxTokens ?? 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.system },
      {
        role: "user",
        content: [
          `Return ONLY valid JSON for ${input.toolName}.`,
          input.toolDescription,
          "Follow this JSON schema exactly:",
          JSON.stringify(input.schema),
          "",
          "User request:",
          input.user,
        ].join("\n"),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`Groq returned an empty JSON response for ${input.toolName}.`);
  }

  try {
    return JSON.parse(content) as T;
  } catch (err) {
    throw new Error(`Groq returned invalid JSON for ${input.toolName}: ${content}`, {
      cause: err,
    });
  }
}
