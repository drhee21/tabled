// Vendor-neutral shapes. Nothing in here names an LLM provider, so the prompt,
// validator, fallback and tests never depend on one.
import type { CuisineValue } from "../preference-options";

/** The only door to the model: send a system prompt and a user prompt, get its raw text back. */
export interface LLMClient {
  /** Throws LLMError on timeouts, API errors, refusals and truncated output. */
  complete(request: { system: string; user: string }): Promise<string>;
}

export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMError";
  }
}

/** One participant, as the ranking sees them. Notes are untrusted text. */
export interface RankingParticipant {
  display_name: string;
  cuisines_want: readonly CuisineValue[];
  cuisines_avoid: readonly CuisineValue[];
  note: string | null;
}

/** One shortlisted place. `reason` is null when code ranked it instead of the model. */
export interface RankedPick {
  place_id: string;
  rank: number;
  reason: string | null;
}
