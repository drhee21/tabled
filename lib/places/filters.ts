// Candidate selection (SPEC.md): deterministic filters, all pure functions.
// The LLM never does any of this.
import type { CuisineValue, DietaryValue } from "../preference-options";
import { MAX_CANDIDATES, MIN_CANDIDATES } from "../search-limits";
import { distanceMeters } from "./geo";
import { isOpenAt } from "./hours";
import type { PlaceCandidate, ScoredCandidate } from "./types";

export interface FilterContext {
  center: { lat: number; lng: number };
  radius_m: number;
  mealTime: Date;
  /** Null means no budget to apply. */
  budget: { min: number; max: number } | null;
  /** Every cuisine any participant refused. */
  refusedCuisines: readonly CuisineValue[];
  /**
   * Cuisines someone wants that nobody refuses, most wanted first. When this is
   * not empty, a place must match one of them: neutral places are dropped.
   */
  wantedCuisines: readonly CuisineValue[];
  /** Every dietary need any participant listed. */
  dietary: readonly DietaryValue[];
}

/** How many places each filter removed, for explaining a failed search. */
export interface DropCounts {
  outside_radius: number;
  closed_at_meal_time: number;
  outside_budget: number;
  refused_cuisine: number;
  no_wanted_cuisine: number;
}

/** Add distance, and mark dietary certainty. Places stay unchanged otherwise. */
export function annotate(
  places: readonly PlaceCandidate[],
  ctx: Pick<FilterContext, "center" | "dietary">,
): ScoredCandidate[] {
  return places.map((p) => ({
    ...p,
    distance_m: distanceMeters(ctx.center, p),
    // Unknown unless the place's data confirms every need in the group.
    dietary_unknown: ctx.dietary.some((d) => !p.raw.dietary_confirmed.includes(d)),
  }));
}

export function filterWithinRadius(
  places: readonly ScoredCandidate[],
  radius_m: number,
): ScoredCandidate[] {
  return places.filter((p) => p.distance_m <= radius_m);
}

/** Keeps places open at the meal time. Places with no hours count as closed. */
export function filterOpenAtMealTime(
  places: readonly ScoredCandidate[],
  mealTime: Date,
): ScoredCandidate[] {
  return places.filter((p) =>
    isOpenAt(p.raw.periods, p.raw.utc_offset_minutes, mealTime),
  );
}

/** Keeps places inside the budget. A place with no price level passes. */
export function filterByBudget(
  places: readonly ScoredCandidate[],
  budget: { min: number; max: number } | null,
): ScoredCandidate[] {
  if (!budget) return [...places];
  return places.filter(
    (p) => p.price_level === null || (p.price_level >= budget.min && p.price_level <= budget.max),
  );
}

/** Drops places that match any refused cuisine. */
export function filterRefusedCuisines(
  places: readonly ScoredCandidate[],
  refused: readonly CuisineValue[],
): ScoredCandidate[] {
  if (refused.length === 0) return [...places];
  return places.filter((p) => !p.cuisine_tags.some((tag) => refused.includes(tag)));
}

/**
 * Keeps places that match at least one wanted cuisine, dropping neutral ones.
 * Places with no cuisine tag are neutral. With nothing wanted, everything stays.
 */
export function filterWantedCuisines(
  places: readonly ScoredCandidate[],
  wanted: readonly CuisineValue[],
): ScoredCandidate[] {
  if (wanted.length === 0) return [...places];
  return places.filter((p) => p.cuisine_tags.some((tag) => wanted.includes(tag)));
}

const byDistanceThenRating = (a: ScoredCandidate, b: ScoredCandidate) =>
  a.distance_m - b.distance_m ||
  (b.rating ?? -1) - (a.rating ?? -1) ||
  a.place_id.localeCompare(b.place_id);

/** Nearest first, then highest rating. Places with no rating come last among equals. */
export function sortAndCap(
  places: readonly ScoredCandidate[],
  cap: number = MAX_CANDIDATES,
): ScoredCandidate[] {
  return [...places].sort(byDistanceThenRating).slice(0, cap);
}

/**
 * Like sortAndCap, but when the group wants several cuisines it fills the cap
 * by taking one place from each cuisine in turn, so a popular cuisine cannot
 * crowd out the rest. A place matching several wanted cuisines counts toward
 * the one with the fewest places, which helps the scarce cuisine. The result is
 * sorted nearest first.
 */
export function sortAndCapBalanced(
  places: readonly ScoredCandidate[],
  wanted: readonly CuisineValue[],
  cap: number = MAX_CANDIDATES,
): ScoredCandidate[] {
  if (wanted.length < 2 || places.length <= cap) return sortAndCap(places, cap);

  const size = new Map(
    wanted.map((c) => [c, places.filter((p) => p.cuisine_tags.includes(c)).length]),
  );
  const bucketOf = (p: ScoredCandidate): CuisineValue =>
    wanted
      .filter((c) => p.cuisine_tags.includes(c))
      .sort((a, b) => size.get(a)! - size.get(b)! || wanted.indexOf(a) - wanted.indexOf(b))[0];

  const buckets = new Map<CuisineValue, ScoredCandidate[]>();
  for (const p of [...places].sort(byDistanceThenRating)) {
    const key = bucketOf(p);
    buckets.set(key, [...(buckets.get(key) ?? []), p]);
  }

  const queues = wanted.flatMap((c) => (buckets.has(c) ? [buckets.get(c)!] : []));
  const picked: ScoredCandidate[] = [];
  while (picked.length < cap && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < cap) picked.push(next);
    }
  }
  return picked.sort(byDistanceThenRating);
}

export interface FilteredPlaces {
  /** Everything that passed every filter, in no particular order. */
  places: ScoredCandidate[];
  dropped: DropCounts;
}

/** Run every filter in order and count what each removed. No size limits yet. */
export function applyFilters(
  places: readonly PlaceCandidate[],
  ctx: FilterContext,
): FilteredPlaces {
  const annotated = annotate(places, ctx);

  const inRadius = filterWithinRadius(annotated, ctx.radius_m);
  const open = filterOpenAtMealTime(inRadius, ctx.mealTime);
  const inBudget = filterByBudget(open, ctx.budget);
  const notRefused = filterRefusedCuisines(inBudget, ctx.refusedCuisines);
  const wanted = filterWantedCuisines(notRefused, ctx.wantedCuisines);

  return {
    places: wanted,
    dropped: {
      outside_radius: annotated.length - inRadius.length,
      closed_at_meal_time: inRadius.length - open.length,
      outside_budget: open.length - inBudget.length,
      refused_cuisine: inBudget.length - notRefused.length,
      no_wanted_cuisine: notRefused.length - wanted.length,
    },
  };
}

export type SelectionResult =
  | { ok: true; candidates: ScoredCandidate[]; dropped: DropCounts }
  | {
      ok: false;
      error: "too_few_candidates";
      message: string;
      found: number;
      dropped: DropCounts;
    };

/** Filter, then sort and cap. Fails with advice when fewer than 3 places remain. */
export function selectCandidates(
  places: readonly PlaceCandidate[],
  ctx: FilterContext,
): SelectionResult {
  const { places: kept, dropped } = applyFilters(places, ctx);

  if (kept.length < MIN_CANDIDATES) {
    return {
      ok: false,
      error: "too_few_candidates",
      message:
        `Only ${kept.length} place${kept.length === 1 ? "" : "s"} matched ` +
        "everyone's needs. Try widening the radius, the budget or the cuisines.",
      found: kept.length,
      dropped,
    };
  }

  return { ok: true, candidates: sortAndCapBalanced(kept, ctx.wantedCuisines), dropped };
}
