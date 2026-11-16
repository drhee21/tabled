import { describe, expect, it } from "vitest";
import {
  budgetMisfit,
  describeTiebreak,
  tiebreakOrder,
  tiebreakScore,
  type BudgetRange,
  type TiebreakPlace,
} from "./tiebreak";

const anyBudget: BudgetRange = { budget_min: null, budget_max: null };
const ctx = { radius_m: 3000, budgets: [anyBudget] };

const place = (over: Partial<TiebreakPlace> & { place_id: string }): TiebreakPlace => ({
  rank: 1,
  rating: 4,
  distance_m: 1000,
  price_level: 2,
  ...over,
});

const winnerOf = (places: TiebreakPlace[], c = ctx) => tiebreakOrder(places, c)[0].place_id;

describe("tiebreak order", () => {
  it("prefers the 4.5 star place 2.1 km away over the 4.0 star place 1.6 km away", () => {
    const near = place({ place_id: "near", rating: 4.0, distance_m: 1600, rank: 1 });
    const far = place({ place_id: "far", rating: 4.5, distance_m: 2100, rank: 2 });
    expect(winnerOf([near, far])).toBe("far");
    // Even when the model ranked the better-rated place last.
    expect(winnerOf([near, { ...far, rank: 3 }])).toBe("far");
  });

  it("holds for any allowed radius over 1 km", () => {
    const near = place({ place_id: "near", rating: 4.0, distance_m: 1600, rank: 1 });
    const far = place({ place_id: "far", rating: 4.5, distance_m: 2100, rank: 3 });
    for (const radius_m of [2200, 2500, 5000, 10_000]) {
      expect(winnerOf([near, far], { ...ctx, radius_m })).toBe("far");
    }
  });

  it("does not send people on a long trip for a small rating gain", () => {
    const close = place({ place_id: "close", rating: 4.3, distance_m: 400, rank: 2, price_level: 1 });
    const distant = place({ place_id: "distant", rating: 4.6, distance_m: 2900, rank: 1, price_level: 1 });
    expect(winnerOf([distant, close])).toBe("close");
  });

  it("prefers the place that fits the group's budgets", () => {
    const budgets: BudgetRange[] = [
      { budget_min: null, budget_max: 2 },
      { budget_min: null, budget_max: 2 },
      { budget_min: null, budget_max: 4 },
      { budget_min: null, budget_max: 4 },
    ];
    const pricey = place({ place_id: "pricey", rating: 4.5, distance_m: 1000, price_level: 4, rank: 1 });
    const fits = place({ place_id: "fits", rating: 4.2, distance_m: 1200, price_level: 2, rank: 2 });
    expect(winnerOf([pricey, fits], { ...ctx, budgets })).toBe("fits");
  });

  it("leans cheaper when everyone's budget allows both", () => {
    const a = place({ place_id: "a", price_level: 1 });
    const b = place({ place_id: "b", price_level: 3 });
    expect(winnerOf([b, a])).toBe("a");
  });

  it("falls back to the lower rank when scores are equal", () => {
    const a = place({ place_id: "a", rank: 2 });
    const b = place({ place_id: "b", rank: 2 });
    const c = place({ place_id: "c", rank: 1, rating: 3.9 });
    // c is behind by 0.1 rating but ahead by 0.1 for rank: equal score, lower rank wins.
    expect(tiebreakOrder([a, b, c], ctx).map((s) => s.place_id)).toEqual(["c", "a", "b"]);
  });

  it("does not depend on input order", () => {
    const places = [
      place({ place_id: "x", rating: 4.4, distance_m: 900, rank: 2 }),
      place({ place_id: "y", rating: 4.4, distance_m: 900, rank: 2 }),
      place({ place_id: "z", rating: 4.1, distance_m: 500, rank: 1 }),
    ];
    const forward = tiebreakOrder(places, ctx).map((s) => s.place_id);
    const backward = tiebreakOrder([...places].reverse(), ctx).map((s) => s.place_id);
    expect(backward).toEqual(forward);
  });
});

describe("tiebreak score", () => {
  it("counts an unrated place as 3.5 stars", () => {
    const unrated = place({ place_id: "u", rating: null });
    const rated = place({ place_id: "r", rating: 3.5 });
    expect(tiebreakScore(unrated, ctx)).toBe(tiebreakScore(rated, ctx));
    expect(winnerOf([unrated, place({ place_id: "ok", rating: 4.2 })])).toBe("ok");
  });

  it("charges nothing for an unknown price", () => {
    const unknown = place({ place_id: "u", price_level: null });
    const free = place({ place_id: "f", price_level: 0 });
    expect(tiebreakScore(unknown, ctx)).toBe(tiebreakScore(free, ctx));
  });

  it("survives a zero radius without dividing by zero", () => {
    expect(Number.isFinite(tiebreakScore(place({ place_id: "a" }), { ...ctx, radius_m: 0 }))).toBe(true);
  });

  it("counts at most two rank steps", () => {
    const third = place({ place_id: "t", rank: 3 });
    const fifth = place({ place_id: "f", rank: 5 });
    expect(tiebreakScore(fifth, ctx)).toBe(tiebreakScore(third, ctx));
  });
});

describe("budget misfit", () => {
  const budgets: BudgetRange[] = [
    { budget_min: 2, budget_max: 3 },
    { budget_min: null, budget_max: 1 },
    anyBudget,
    { budget_min: 3, budget_max: null },
  ];

  it("is the share of people the price level excludes", () => {
    expect(budgetMisfit(1, budgets)).toBe(0.5); // too cheap for #1 and #4
    expect(budgetMisfit(2, budgets)).toBe(0.5); // too pricey for #2, too cheap for #4
    expect(budgetMisfit(3, budgets)).toBe(0.25); // too pricey for #2
  });

  it("is zero for an unknown price or nobody answered", () => {
    expect(budgetMisfit(null, budgets)).toBe(0);
    expect(budgetMisfit(4, [])).toBe(0);
  });
});

describe("describeTiebreak", () => {
  const w = { rating: 4.5, distance_m: 2100, price_level: 2 };

  it("names a higher rating that outweighed more distance", () => {
    expect(describeTiebreak(w, [{ rating: 4.0, distance_m: 1600, price_level: 2 }], 2)).toBe(
      "Tied at 2 votes. Chosen because its higher rating outweighed the extra distance.",
    );
  });

  it("names a higher rating and a shorter distance together", () => {
    expect(describeTiebreak(w, [{ rating: 4.0, distance_m: 3000, price_level: 2 }], 1)).toBe(
      "Tied at 1 vote. Chosen for its higher rating and shorter distance.",
    );
  });

  it("does not claim a similar rating when the winner is rated much lower", () => {
    const text = describeTiebreak(
      { rating: 3.8, distance_m: 300, price_level: 2 },
      [{ rating: 4.6, distance_m: 2500, price_level: 2 }],
      2,
    );
    expect(text).toBe("Tied at 2 votes. Chosen because it is much closer.");
  });

  it("falls back to a general line when no single reason stands out", () => {
    expect(
      describeTiebreak(
        { rating: 4.2, distance_m: 1500, price_level: null },
        [{ rating: null, distance_m: 1000, price_level: null }],
        3,
      ),
    ).toBe("Tied at 3 votes. Chosen as the best fit for rating, distance and budget.");
  });
});
