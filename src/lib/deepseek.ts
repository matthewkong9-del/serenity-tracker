export interface DeepSeekOptions {
  model?: string;
  temperature?: number;
  responseFormat?: "text" | "json_object";
  /** What this call is for — logged to track costs. */
  purpose?: string;
  /** Per-call timeout in ms. Default 180_000 (3 min). Increase for large prompts. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Provider registry — add new providers here without touching any caller.
// ---------------------------------------------------------------------------

interface ProviderConfig {
  label: string;
  endpoint: string;
  defaultModel: string;
  /** Env var that holds the API key for this provider. */
  apiKeyEnv: string;
  /** USD per 1M input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  deepseek: {
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-v4-pro",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    inputPerMTok: 0.27,
    outputPerMTok: 1.10,
  },
  zai: {
    label: "Z.AI",
    endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
    defaultModel: "glm-5.2",
    apiKeyEnv: "ZAI_API_KEY",
    // Approximate GLM pricing — verify against Z.AI's current rate card.
    inputPerMTok: 0.6,
    outputPerMTok: 2.2,
  },
};

function resolveProvider(): ProviderConfig {
  const name = process.env.AI_PROVIDER || "deepseek";
  if (!PROVIDERS[name]) {
    console.warn(`[ai] Unknown AI_PROVIDER "${name}", falling back to deepseek`);
    return PROVIDERS.deepseek;
  }
  return PROVIDERS[name];
}

function resolveApiKey(passedKey: string, provider: ProviderConfig): string {
  // Prefer the provider-specific env var when a non-default provider is active,
  // so callers that still read DEEPSEEK_API_KEY don't block the switch.
  if (process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "deepseek") {
    const key = process.env[provider.apiKeyEnv];
    if (key) return key;
  }
  return passedKey;
}

// ---------------------------------------------------------------------------
// Cost tracking
// ---------------------------------------------------------------------------

// ~4 chars ≈ 1 token — fallback when the API omits a usage block.
const CHARS_PER_TOKEN = 4;

async function logCall(
  purpose: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  provider: ProviderConfig
) {
  try {
    const { prisma } = await import("@/lib/db");
    const cost =
      (inputTokens * provider.inputPerMTok +
        outputTokens * provider.outputPerMTok) /
      1_000_000;
    await prisma.apiCallLog.create({
      data: {
        source: provider.label,
        purpose,
        model,
        inputChars: inputTokens, // now token counts (field reused)
        outputChars: outputTokens,
        estimatedCost: Math.round(cost * 1_000_000) / 1_000_000, // 6 decimal places
      },
    });
  } catch {
    // Never let logging break the actual call
  }
}

// ---------------------------------------------------------------------------
// Public API (unchanged signatures — zero caller churn)
// ---------------------------------------------------------------------------

/**
 * Call the LLM Chat API. Provider is determined by the AI_PROVIDER env var
 * (default: "deepseek"). One module, one interface — all callers cross the
 * same seam regardless of which provider is active.
 */
export async function chat(
  messages: { role: "user" | "system" | "assistant"; content: string }[],
  apiKey: string,
  options?: DeepSeekOptions
): Promise<string> {
  const provider = resolveProvider();
  const key = resolveApiKey(apiKey, provider);
  const model = options?.model ?? process.env.AI_MODEL ?? provider.defaultModel;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.1,
  };

  if (options?.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options?.timeoutMs ?? 180_000),
  });

  const raw = await response.text();

  // Guard before parsing: gateways/proxies answer 5xx with HTML pages, and a
  // JSON.parse of HTML surfaces as a cryptic "Unexpected token '<'" — fail with
  // the real status instead.
  if (!response.ok) {
    throw new Error(
      `${provider.label} API error (HTTP ${response.status}): ${raw.slice(0, 300) || "(empty body)"}`
    );
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `${provider.label} returned non-JSON (HTTP ${response.status}): ${raw.slice(0, 300)}`
    );
  }
  if (data.error) throw new Error(data.error.message);

  const output = data.choices[0].message.content as string;

  // Log cost in background (never blocks the caller). Prefer the API's real
  // token usage; fall back to a char-based estimate when it's absent.
  if (options?.purpose) {
    const usage = data.usage;
    const inputTokens =
      usage?.prompt_tokens ??
      Math.ceil(
        messages.reduce((sum, m) => sum + m.content.length, 0) / CHARS_PER_TOKEN
      );
    const outputTokens =
      usage?.completion_tokens ?? Math.ceil(output.length / CHARS_PER_TOKEN);
    void logCall(options.purpose, model, inputTokens, outputTokens, provider);
  }

  return output;
}

/**
 * Call DeepSeek with JSON response format. Parses the output and extracts
 * a JSON object from potentially markdown-wrapped text.
 */
export async function chatJson<T = Record<string, unknown>>(
  messages: { role: "user" | "system" | "assistant"; content: string }[],
  apiKey: string,
  options?: Omit<DeepSeekOptions, "responseFormat">
): Promise<T> {
  const text = await chat(messages, apiKey, {
    ...options,
    responseFormat: "json_object",
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in DeepSeek response");

  return JSON.parse(jsonMatch[0]) as T;
}
