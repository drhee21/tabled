// Fixture data for tests only. Nothing here calls a real model.
import { makePlace } from "../places/test-fixtures";
import type { ScoredCandidate } from "../places/types";
import { LLMError, type LLMClient, type RankingParticipant } from "./types";

export function makeCandidate(
  overrides: Parameters<typeof makePlace>[0] & { distance_m?: number; dietary_unknown?: boolean } = {},
): ScoredCandidate {
  const { distance_m, dietary_unknown, ...place } = overrides;
  const base = makePlace(place);
  return {
    ...base,
    distance_m: distance_m ?? place.meters ?? 200,
    dietary_unknown: dietary_unknown ?? false,
  };
}

export function makeParticipant(overrides: Partial<RankingParticipant> = {}): RankingParticipant {
  return {
    display_name: "Ana",
    cuisines_want: [],
    cuisines_avoid: [],
    note: null,
    ...overrides,
  };
}

/** Five candidates with ids a, b, c, d, e. */
export function fiveCandidates(): ScoredCandidate[] {
  return ["a", "b", "c", "d", "e"].map((id, i) =>
    makeCandidate({ place_id: id, name: `Place ${id}`, meters: 100 * (i + 1) }),
  );
}

export function answer(picks: { place_id: string; rank: number; reason: string }[]): string {
  return JSON.stringify({ picks });
}

export const VALID_ANSWER = answer([
  { place_id: "a", rank: 1, reason: "2 of 3 want Thai and it is the nearest." },
  { place_id: "b", rank: 2, reason: "Matches Ben’s pizza request." },
  { place_id: "c", rank: 3, reason: "Fits the group’s budget." },
]);

/**
 * A mocked LLMClient. Each call returns the next scripted reply; a reply that is
 * an Error is thrown. Records every request so tests can inspect the prompt.
 */
export function scriptedLLM(replies: (string | Error)[]): LLMClient & {
  requests: { system: string; user: string }[];
} {
  const requests: { system: string; user: string }[] = [];
  return {
    requests,
    async complete(request) {
      requests.push(request);
      const reply = replies[requests.length - 1];
      if (reply === undefined) throw new LLMError("No scripted reply");
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}
