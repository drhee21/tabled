import { createAnthropicClient } from "./anthropic-client";
import type { LLMClient } from "./types";

/** The client the app uses. Reads the key and model from the server environment only. */
export function getLLMClient(): LLMClient {
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!apiKey || !model) {
    throw new Error("LLM_API_KEY and LLM_MODEL must be set (see .env.example)");
  }
  return createAnthropicClient({ apiKey, model });
}

export type { LLMClient } from "./types";
