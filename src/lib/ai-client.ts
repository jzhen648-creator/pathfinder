import OpenAI from "openai";
import { runSerializedAiJob } from "@/lib/ai/ai-job-queue";
import { assertAiUserRateLimit, AiUserRateLimitError, recordAiUserRateLimitSuccess } from "@/lib/ai/ai-user-rate-limit";

type AiProvider = "gemini" | "groq" | "deepseek";

type ProviderConfig = {
  id: AiProvider;
  label: string;
  baseURL: string;
  model: string;
  apiKeyEnvVar: string;
};

const AI_PROVIDER_CONFIGS: Record<AiProvider, ProviderConfig> = {
  gemini: {
    id: "gemini",
    label: "Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    apiKeyEnvVar: "GEMINI_API_KEY",
  },
  groq: {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    apiKeyEnvVar: "GROQ_API_KEY",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
  },
};

export class AiNotConfiguredError extends Error {
  constructor(message?: string) {
    super(message ?? "AI provider is not configured.");
    this.name = "AiNotConfiguredError";
  }
}

function getConfiguredProviderName() {
  return (process.env.AI_PROVIDER?.trim().toLowerCase() || "gemini") as string;
}

function getProviderConfig() {
  const providerName = getConfiguredProviderName();
  const config = AI_PROVIDER_CONFIGS[providerName as AiProvider];

  if (!config) {
    throw new AiNotConfiguredError(
      `Unsupported AI_PROVIDER "${providerName}". Supported providers: gemini, groq, deepseek.`,
    );
  }

  return config;
}

function getProviderApiKey(config: ProviderConfig) {
  const apiKey = process.env[config.apiKeyEnvVar]?.trim();
  if (!apiKey) {
    throw new AiNotConfiguredError(
      `${config.apiKeyEnvVar} is not configured for AI_PROVIDER=${config.id}.`,
    );
  }
  return apiKey;
}

function getAiClient() {
  const config = getProviderConfig();
  const apiKey = getProviderApiKey(config);
  return { client: new OpenAI({ apiKey, baseURL: config.baseURL }), config };
}

function providerStatus(err: unknown): number | null {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

function isRateLimitError(err: unknown): boolean {
  if (providerStatus(err) === 429) return true;
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return message.includes("429") || message.includes("rate limit") || message.includes("quota");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRateLimitRetry<T>(operation: () => Promise<T>): Promise<T> {
  const delaysMs = [2_000, 5_000, 12_000];
  let lastError: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const retryable = err instanceof AiUserRateLimitError;
      if (!retryable || attempt >= delaysMs.length) {
        throw err;
      }
      const delay = err.retryAfterMs;
      await sleep(delay);
    }
  }
  throw lastError;
}

function withGeminiReasoningEffort(config: ProviderConfig) {
  return config.id === "gemini" ? { reasoning_effort: "none" as const } : {};
}

export function hasAiKey() {
  try {
    const config = getProviderConfig();
    return Boolean(process.env[config.apiKeyEnvVar]?.trim());
  } catch {
    return false;
  }
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
  /** Per-user queue key — serializes concurrent AI jobs for one account. */
  queueKey?: string | null;
}): Promise<string> {
  const { queueKey, ...textInput } = input;
  return runSerializedAiJob(queueKey, async () => {
    const { client, config } = getAiClient();
    const completion = await withRateLimitRetry(async () => {
      assertAiUserRateLimit(queueKey);
      return client.chat.completions.create({
        model: config.model,
        ...withGeminiReasoningEffort(config),
        temperature: textInput.temperature ?? 0.7,
        max_tokens: textInput.maxTokens ?? 1024,
        messages: [
          { role: "system", content: textInput.system },
          ...textInput.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        ],
      });
    });

    recordAiUserRateLimitSuccess(queueKey);
    return completion.choices[0]?.message?.content?.trim() ?? "";
  });
}

/** Stream assistant prose token-by-token (Stream narrative phase). */
export async function* generateTextStream(input: {
  system: string;
  messages: TextMessage[];
  maxTokens?: number;
  temperature?: number;
}): AsyncGenerator<string> {
  const { client, config } = getAiClient();
  const stream = await client.chat.completions.create({
    model: config.model,
    ...withGeminiReasoningEffort(config),
    temperature: input.temperature ?? 0.7,
    max_tokens: input.maxTokens ?? 512,
    stream: true,
    messages: [
      { role: "system", content: input.system },
      ...input.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function generateJsonCompletion(input: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Per-user queue key — serializes concurrent AI jobs for one account. */
  queueKey?: string | null;
}): Promise<string> {
  const { queueKey, ...completionInput } = input;
  return runSerializedAiJob(queueKey, async () => {
    const { client, config } = getAiClient();
    const completion = await withRateLimitRetry(async () => {
      assertAiUserRateLimit(queueKey);
      return client.chat.completions.create({
        model: config.model,
        ...withGeminiReasoningEffort(config),
        temperature: completionInput.temperature ?? 0.2,
        max_tokens: completionInput.maxTokens ?? 1024,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: completionInput.system },
          { role: "user", content: completionInput.user },
        ],
      });
    });

    recordAiUserRateLimitSuccess(queueKey);
    return completion.choices[0]?.message?.content?.trim() ?? "";
  });
}

export async function generateStructured<T = unknown>(input: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const { client, config } = getAiClient();

  const completion = await withRateLimitRetry(() =>
    client.chat.completions.create({
    model: config.model,
    ...withGeminiReasoningEffort(config),
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
    }),
  );

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`${config.label} returned an empty JSON response for ${input.toolName}.`);
  }

  try {
    return JSON.parse(content) as T;
  } catch (err) {
    throw new Error(`${config.label} returned invalid JSON for ${input.toolName}: ${content}`, {
      cause: err,
    });
  }
}
