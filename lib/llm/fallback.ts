// Used when the model's answer cannot be trusted: a plain score from code.
import type { ScoredCandidate } from "../places/types";
import type { RankedPick, RankingParticipant } from "./types";
import { SHORTLIST_SIZE } from "./validate";

/** How many people want at least one of the place's cuisines. */
function wantedMatches(
  candidate: ScoredCandidate,
  participants: readonly Pick<RankingParticipant, "cuisines_want">[],
): number {
  return participants.filter((p) =>
    p.cuisines_want.some((cuisine) => candidate.cuisine_tags.includes(cuisine)),
  ).length;
}

/**
 * Most wanted-cuisine matches first, then nearest, then highest rated (unrated
 * last), then place_id so the order never depends on input order. Takes the top
 * three and gives no reasons.
 */
export function fallbackRanking(
  candidates: readonly ScoredCandidate[],
  participants: readonly Pick<RankingParticipant, "cuisines_want">[],
): RankedPick[] {
  return candidates
    .map((c) => ({ c, matches: wantedMatches(c, participants) }))
    .sort(
      (a, b) =>
        b.matches - a.matches ||
        a.c.distance_m - b.c.distance_m ||
        (b.c.rating ?? -1) - (a.c.rating ?? -1) ||
        a.c.place_id.localeCompare(b.c.place_id),
    )
    .slice(0, SHORTLIST_SIZE)
    .map(({ c }, i) => ({ place_id: c.place_id, rank: i + 1, reason: null }));
}
