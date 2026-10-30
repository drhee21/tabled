// Ranks the filtered candidates: ask the model, validate, retry once, then fall
// back to code. Ranking never fails the search.
import type { ScoredCandidate } from "../places/types";
import { fallbackRanking } from "./fallback";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import type { LLMClient, RankedPick, RankingParticipant } from "./types";
import { validateRanking, type ValidationIssue } from "./validate";

/** The first try plus one retry. */
export const MAX_ATTEMPTS = 2;

export interface RankingResult {
  picks: RankedPick[];
  /** "llm" when a validated model answer was used, "code" for the fallback. */
  ranked_by: "llm" | "code";
  attempts: number;
}

export async function rankCandidates(
  client: LLMClient,
  candidates: readonly ScoredCandidate[],
  participants: readonly RankingParticipant[],
): Promise<RankingResult> {
  const ids = candidates.map((c) => c.place_id);
  let issues: ValidationIssue[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: string | null = null;
    try {
      raw = await client.complete({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(candidates, participants, issues),
      });
    } catch {
      // Timeout, API error, refusal or truncation. Counts as a failed attempt.
      issues = [];
    }

    if (raw !== null) {
      const result = validateRanking(raw, ids);
      if (result.ok) return { picks: result.picks, ranked_by: "llm", attempts: attempt };
      issues = result.issues;
    }
    // Codes only: never the model's output, a note, a name or a coordinate.
    console.warn(
      `LLM ranking attempt ${attempt} of ${MAX_ATTEMPTS} failed: ${raw === null ? "request_failed" : issues.join(",")}`,
    );
  }

  return {
    picks: fallbackRanking(candidates, participants),
    ranked_by: "code",
    attempts: MAX_ATTEMPTS,
  };
}
