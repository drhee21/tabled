// Runs one search: turns participants' answers into requirements, asks the
// provider for places, and applies the filters. No database in here, so it
// can be tested with a mocked provider.
import type { BudgetSummary } from "../api-types";
import type { CuisineValue, DietaryValue } from "../preference-options";
import { groupBudget, type BudgetRange } from "./budget";
import { applyFilters, selectCandidates, type DropCounts, type FilterContext } from "./filters";
import {
  PlacesProviderError,
  type PlaceCandidate,
  type PlacesProvider,
  type ScoredCandidate,
} from "./types";

/** One participant who has submitted answers. */
export interface ParticipantAnswers {
  display_name: string;
  dietary: DietaryValue[];
  budget_min: number | null;
  budget_max: number | null;
  cuisines_want: CuisineValue[];
  cuisines_avoid: CuisineValue[];
}

export interface SearchInput {
  session: { lat: number; lng: number; radius_m: number; meal_time: string };
  participants: readonly ParticipantAnswers[];
}

/**
 * The first call asks for every wanted cuisine at once. If one cuisine takes at
 * least this share of the places that survive filtering, the rest are
 * under-represented, and the other wanted cuisines get their own calls.
 * A fair three-way split is about 33% each, so 70% means the others are barely
 * there.
 */
export const VARIETY_BIAS_THRESHOLD = 0.7;

/** Extra calls after the first, which already covers the dominant cuisine. Three calls at most. */
export const MAX_FOLLOW_UP_CALLS = 2;

const NO_DROPS: DropCounts = {
  outside_radius: 0,
  closed_at_meal_time: 0,
  outside_budget: 0,
  refused_cuisine: 0,
  no_wanted_cuisine: 0,
};

export type SearchOutcome =
  | {
      ok: true;
      candidates: ScoredCandidate[];
      budget: BudgetSummary | null;
      dropped: DropCounts;
      /** Places API calls this search made, from 1 to 3. */
      provider_calls: number;
      /** Cuisines that got their own call because the first call was lopsided. */
      follow_up_cuisines: CuisineValue[];
    }
  | {
      ok: false;
      error: "too_few_candidates" | "no_wanted_cuisine_left";
      message: string;
      found: number;
      budget: BudgetSummary | null;
      dropped: DropCounts;
      /** Zero means nothing was billed and the search can be given back. */
      provider_calls: number;
    };

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/** Wanted cuisines nobody refuses, most wanted first, then alphabetical. */
export function rankWantedCuisines(
  participants: readonly ParticipantAnswers[],
  refused: readonly CuisineValue[],
): CuisineValue[] {
  const headcount = new Map<CuisineValue, number>();
  for (const p of participants) {
    for (const c of p.cuisines_want) headcount.set(c, (headcount.get(c) ?? 0) + 1);
  }
  return [...headcount.keys()]
    .filter((c) => !refused.includes(c))
    .sort((a, b) => headcount.get(b)! - headcount.get(a)! || a.localeCompare(b));
}

/**
 * The cuisine hogging the results, or null if the spread is acceptable.
 * Looks at places that survived every filter, since those are what the group
 * would see. A place matching two wanted cuisines counts toward both.
 */
export function dominantCuisine(
  survivors: readonly ScoredCandidate[],
  wanted: readonly CuisineValue[],
  threshold: number = VARIETY_BIAS_THRESHOLD,
): CuisineValue | null {
  if (wanted.length < 2 || survivors.length === 0) return null;

  let best: { cuisine: CuisineValue; count: number } | null = null;
  for (const cuisine of wanted) {
    const count = survivors.filter((p) => p.cuisine_tags.includes(cuisine)).length;
    if (!best || count > best.count) best = { cuisine, count };
  }
  return best && best.count / survivors.length >= threshold ? best.cuisine : null;
}

/** Throws PlacesProviderError if the first provider call fails. Follow-up failures are tolerated. */
export async function searchCandidates(
  provider: PlacesProvider,
  input: SearchInput,
): Promise<SearchOutcome> {
  const { session, participants } = input;

  const refusedCuisines = unique(participants.flatMap((p) => p.cuisines_avoid));
  const everyWanted = unique(participants.flatMap((p) => p.cuisines_want));
  const wantedCuisines = rankWantedCuisines(participants, refusedCuisines);
  const dietary = unique(participants.flatMap((p) => p.dietary));

  const budget = groupBudget(
    participants.map((p): BudgetRange => ({ min: p.budget_min, max: p.budget_max })),
  );
  const budgetSummary: BudgetSummary | null = budget && {
    min: budget.min,
    max: budget.max,
    unanimous: budget.unanimous,
    left_out: budget.uncovered.map((i) => participants[i].display_name),
  };

  // Everything the group wants is refused by someone, so no place can satisfy both.
  if (everyWanted.length > 0 && wantedCuisines.length === 0) {
    return {
      ok: false,
      error: "no_wanted_cuisine_left",
      message:
        "Every cuisine someone wants is refused by someone else. " +
        "Ask the group to change their cuisines.",
      found: 0,
      budget: budgetSummary,
      dropped: NO_DROPS,
      provider_calls: 0,
    };
  }

  const ctx: FilterContext = {
    center: { lat: session.lat, lng: session.lng },
    radius_m: session.radius_m,
    mealTime: new Date(session.meal_time),
    budget: budget && { min: budget.min, max: budget.max },
    refusedCuisines,
    wantedCuisines,
    dietary,
  };

  const base = { lat: session.lat, lng: session.lng, radius_m: session.radius_m };

  let places: PlaceCandidate[] = await provider.search({
    ...base,
    wantedCuisines,
    refusedCuisines,
  });
  let providerCalls = 1;

  // Was the first call lopsided toward one cuisine? If so, ask for the others by name.
  const followUpCuisines: CuisineValue[] = [];
  const dominant = dominantCuisine(applyFilters(places, ctx).places, wantedCuisines);
  if (dominant) {
    const others = wantedCuisines.filter((c) => c !== dominant).slice(0, MAX_FOLLOW_UP_CALLS);
    for (const cuisine of others) {
      providerCalls += 1;
      try {
        const more = await provider.search({ ...base, wantedCuisines: [cuisine], refusedCuisines });
        places = places.concat(more);
        followUpCuisines.push(cuisine);
      } catch (err) {
        // The first call already succeeded, so keep going with what we have.
        if (!(err instanceof PlacesProviderError)) throw err;
        console.error(`Follow-up search failed: ${err.message}`);
      }
    }
  }

  // The same place can come back from more than one call.
  const merged = [...new Map(places.map((p) => [p.place_id, p])).values()];
  const result = selectCandidates(merged, ctx);

  return result.ok
    ? {
        ok: true,
        candidates: result.candidates,
        budget: budgetSummary,
        dropped: result.dropped,
        provider_calls: providerCalls,
        follow_up_cuisines: followUpCuisines,
      }
    : { ...result, budget: budgetSummary, provider_calls: providerCalls };
}
