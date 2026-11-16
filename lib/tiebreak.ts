// Breaks a tie for the most votes. Pure: no database, so every rule is unit tested.
// Safe for client code too: it takes numbers and place fields only.
//
// Each tied place gets a score in star points and the highest wins:
//   rating - distance cost - budget cost + rank nudge
// Scores come from fixed scales, not from comparing the tied places with each
// other, so a tiny gap in rating stays tiny.

export const TIEBREAK_WEIGHTS = {
  /** Used for a place with no rating. Below a typical Google rating, so unrated places do not win by default. */
  unratedStars: 3.5,
  /** A place at the edge of the search radius costs this many stars. */
  starsPerRadius: 1,
  /** A place that suits nobody's budget costs this many stars; the cost scales with how many it excludes. */
  starsForNoBudgetFit: 1,
  /** Each price level costs this much, so cheaper wins a close call. */
  starsPerPriceLevel: 0.1,
  /** Each rank step below the LLM's (or the fallback's) first pick costs this much. */
  starsPerRankStep: 0.1,
} as const;

/** The most rank steps the nudge counts: the shortlist has three picks. */
const MAX_RANK_STEPS = 2;

export interface TiebreakPlace {
  place_id: string;
  /** 1 is the best pick, from the model or from the code fallback. */
  rank: number;
  rating: number | null;
  distance_m: number;
  /** 0 (free) to 4 (very expensive), or null when unknown. */
  price_level: number | null;
}

/** One participant's budget as price levels; null means no limit on that side. */
export interface BudgetRange {
  budget_min: number | null;
  budget_max: number | null;
}

export interface TiebreakContext {
  radius_m: number;
  /** Everyone who has answered. */
  budgets: readonly BudgetRange[];
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** The share of participants (0 to 1) whose budget excludes the price level. Unknown price excludes nobody. */
export function budgetMisfit(priceLevel: number | null, budgets: readonly BudgetRange[]): number {
  if (priceLevel === null || budgets.length === 0) return 0;
  const excluded = budgets.filter(
    (b) =>
      (b.budget_min !== null && priceLevel < b.budget_min) ||
      (b.budget_max !== null && priceLevel > b.budget_max),
  ).length;
  return excluded / budgets.length;
}

/** The place's score in star points. Higher wins. */
export function tiebreakScore(place: TiebreakPlace, ctx: TiebreakContext): number {
  const w = TIEBREAK_WEIGHTS;
  const rating = place.rating ?? w.unratedStars;
  const distanceCost = ctx.radius_m > 0 ? (place.distance_m / ctx.radius_m) * w.starsPerRadius : 0;
  const budgetCost =
    budgetMisfit(place.price_level, ctx.budgets) * w.starsForNoBudgetFit +
    (place.price_level ?? 0) * w.starsPerPriceLevel;
  const rankCost = Math.min(Math.max(place.rank - 1, 0), MAX_RANK_STEPS) * w.starsPerRankStep;
  return round(rating - distanceCost - budgetCost - rankCost);
}

/**
 * The places best first. Equal scores go to the lower rank, then place_id, so
 * the order never depends on input order.
 */
export function tiebreakOrder(
  places: readonly TiebreakPlace[],
  ctx: TiebreakContext,
): { place_id: string; score: number }[] {
  return places
    .map((p) => ({ place: p, score: tiebreakScore(p, ctx) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.place.rank - b.place.rank ||
        a.place.place_id.localeCompare(b.place.place_id),
    )
    .map(({ place, score }) => ({ place_id: place.place_id, score }));
}

/**
 * One sentence on why the winner beat the places it tied with. It reads only
 * fields every viewer already sees, so it can run in the browser. Budget fit
 * is not named because individual budgets are private.
 */
export function describeTiebreak(
  winner: Pick<TiebreakPlace, "rating" | "distance_m" | "price_level">,
  tiedWith: readonly Pick<TiebreakPlace, "rating" | "distance_m" | "price_level">[],
  votes: number,
): string {
  const lead = `Tied at ${votes} ${votes === 1 ? "vote" : "votes"}.`;
  const rated = tiedWith.filter((o) => o.rating !== null);
  const betterRated =
    winner.rating !== null && rated.length > 0 && rated.every((o) => winner.rating! - o.rating! >= 0.2);
  const closer = tiedWith.every((o) => winner.distance_m < o.distance_m);
  const cheaper = tiedWith.every(
    (o) => winner.price_level !== null && o.price_level !== null && winner.price_level < o.price_level,
  );

  const similarRating = rated.every((o) => winner.rating === null || Math.abs(winner.rating - o.rating!) < 0.2);

  if (betterRated && closer) return `${lead} Chosen for its higher rating and shorter distance.`;
  if (betterRated) return `${lead} Chosen because its higher rating outweighed the extra distance.`;
  if (closer && similarRating) return `${lead} Chosen for being closer, with a similar rating.`;
  if (closer) return `${lead} Chosen because it is much closer.`;
  if (cheaper) return `${lead} Chosen for being easier on the budget.`;
  return `${lead} Chosen as the best fit for rating, distance and budget.`;
}
