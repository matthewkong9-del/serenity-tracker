export interface DeepSeekOptions {
  model?: string;
  temperature?: number;
  responseFormat?: "text" | "json_object";
}

/**
 * Call the DeepSeek Chat API. One module, one interface — all callers cross the same seam.
 */
export async function chat(
  messages: { role: "user" | "system" | "assistant"; content: string }[],
  apiKey: string,
  options?: DeepSeekOptions
): Promise<string> {
  const body: Record<string, unknown> = {
    model: options?.model ?? "deepseek-chat",
    messages,
    temperature: options?.temperature ?? 0.1,
  };

  if (options?.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  return data.choices[0].message.content;
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
