// The only module that imports the Anthropic SDK. Everything else goes through
// the LLMClient interface in ./types.
import Anthropic from "@anthropic-ai/sdk";
import { LLMError, type LLMClient } from "./types";

/** Five one-line reasons are about 300 tokens; the rest is headroom for the model's own reasoning. */
const MAX_OUTPUT_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 20_000;

/** The shape the model must return. Counts and lengths are checked in code, not here. */
const RANKING_JSON_SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          place_id: { type: "string" },
          rank: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["place_id", "rank", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
} as const;

export function createAnthropicClient(options: { apiKey: string; model: string }): LLMClient {
  // The caller owns the one retry, so the SDK's own retries are off.
  const client = new Anthropic({
    apiKey: options.apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });

  return {
    async complete({ system, user }) {
      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          model: options.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system,
          messages: [{ role: "user", content: user }],
          output_config: {
            // Ranking a short list is a small task.
            effort: "low",
            format: { type: "json_schema", schema: RANKING_JSON_SCHEMA },
          },
        });
      } catch (err) {
        // Status and error class only: the SDK message can quote the request.
        const status = err instanceof Anthropic.APIError ? ` (${err.status ?? "network"})` : "";
        throw new LLMError(`The language model request failed${status}`);
      }

      if (response.stop_reason === "refusal") throw new LLMError("The language model declined");
      if (response.stop_reason === "max_tokens") {
        throw new LLMError("The language model ran out of output tokens");
      }

      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") throw new LLMError("The language model returned no text");
      return text.text;
    },
  };
}
