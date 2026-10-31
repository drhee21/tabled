// Vote counting. Pure: no database, so every rule is unit tested directly.
// Safe for client code too: it takes ids and numbers only.

export interface ShortlistRank {
  place_id: string;
  /** 1 is the best pick, from the model or from the code fallback. */
  rank: number;
}

export interface Vote {
  participant_id: string;
  place_id: string;
}

export interface TalliedPlace extends ShortlistRank {
  votes: number;
}

export interface Tally {
  /** Votes per shortlisted place, including zeros. */
  counts: Record<string, number>;
  /** People who have a counted vote. */
  voted: number;
  /** Every shortlisted place, most votes first, ties by lower rank. The first is the winner. */
  standings: TalliedPlace[];
  /** The winning place_id, or null if the shortlist is empty. */
  winner: string | null;
}

/** True when the place is one of the shortlisted places. */
export function isShortlisted(shortlist: readonly ShortlistRank[], placeId: string): boolean {
  return shortlist.some((s) => s.place_id === placeId);
}

/**
 * Count votes. One vote per person: if a participant appears more than once,
 * their last vote replaces the earlier ones. Votes for places that are not on
 * the shortlist are ignored. The winner has the most votes; a tie goes to the
 * lower rank number, so with no votes at all the rank 1 pick wins.
 */
export function tally(shortlist: readonly ShortlistRank[], votes: readonly Vote[]): Tally {
  const onShortlist = new Set(shortlist.map((s) => s.place_id));

  const latest = new Map<string, string>();
  for (const v of votes) {
    if (onShortlist.has(v.place_id)) latest.set(v.participant_id, v.place_id);
  }

  const counts: Record<string, number> = Object.fromEntries(
    shortlist.map((s) => [s.place_id, 0]),
  );
  for (const placeId of latest.values()) counts[placeId] += 1;

  const standings = shortlist
    .map((s) => ({ ...s, votes: counts[s.place_id] }))
    .sort((a, b) => b.votes - a.votes || a.rank - b.rank);

  return {
    counts,
    voted: latest.size,
    standings,
    winner: standings[0]?.place_id ?? null,
  };
}
