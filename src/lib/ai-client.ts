import OpenAI from "openai";

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
    model: "gemini-2.5-flash",
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
}): Promise<string> {
  const { client, config } = getAiClient();
  const completion = await client.chat.completions.create({
    model: config.model,
    ...withGeminiReasoningEffort(config),
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
}): Promise<string> {
  const { client, config } = getAiClient();
  const completion = await client.chat.completions.create({
    model: config.model,
    ...withGeminiReasoningEffort(config),
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
  const { client, config } = getAiClient();

  const completion = await client.chat.completions.create({
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
  });

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
