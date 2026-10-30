import { describe, expect, it } from "vitest";
import {
  annotate,
  filterByBudget,
  filterOpenAtMealTime,
  filterRefusedCuisines,
  filterWantedCuisines,
  filterWithinRadius,
  selectCandidates,
  sortAndCap,
  sortAndCapBalanced,
  type FilterContext,
} from "./filters";
import { CENTER, MEAL_TIME, makePlace, openDaily } from "./test-fixtures";

const ctx = (overrides: Partial<FilterContext> = {}): FilterContext => ({
  center: CENTER,
  radius_m: 1500,
  mealTime: MEAL_TIME,
  budget: null,
  refusedCuisines: [],
  wantedCuisines: [],
  dietary: [],
  ...overrides,
});

const scored = (...args: Parameters<typeof makePlace>) => annotate([makePlace(...args)], ctx())[0];

describe("annotate", () => {
  it("computes distance in code", () => {
    expect(Math.abs(scored({ meters: 600 }).distance_m - 600)).toBeLessThanOrEqual(1);
  });

  it("marks nothing unknown when the group has no dietary needs", () => {
    expect(scored().dietary_unknown).toBe(false);
  });

  it("marks a place unknown when its data does not confirm a dietary need", () => {
    const [p] = annotate([makePlace()], ctx({ dietary: ["vegan"] }));
    expect(p.dietary_unknown).toBe(true);
  });

  it("does not mark a place unknown when its data confirms every need", () => {
    const place = makePlace({ raw: { dietary_confirmed: ["vegan", "vegetarian"] } });
    const [p] = annotate([place], ctx({ dietary: ["vegan", "vegetarian"] }));
    expect(p.dietary_unknown).toBe(false);
  });

  it("stays unknown if even one need is unconfirmed", () => {
    const place = makePlace({ raw: { dietary_confirmed: ["vegan"] } });
    const [p] = annotate([place], ctx({ dietary: ["vegan", "gluten-free"] }));
    expect(p.dietary_unknown).toBe(true);
  });

  it("never drops a place for dietary reasons", () => {
    const places = [makePlace(), makePlace(), makePlace()];
    expect(annotate(places, ctx({ dietary: ["kosher"] }))).toHaveLength(3);
  });
});

describe("filterWithinRadius", () => {
  it("drops places beyond the radius and keeps the rest", () => {
    const near = scored({ meters: 900 });
    const far = scored({ meters: 2100 });
    expect(filterWithinRadius([near, far], 1500)).toEqual([near]);
  });

  it("keeps a place exactly on the boundary", () => {
    const edge = { ...scored(), distance_m: 1500 };
    expect(filterWithinRadius([edge], 1500)).toHaveLength(1);
  });
});

describe("filterOpenAtMealTime", () => {
  it("keeps places that are open at the meal time", () => {
    expect(filterOpenAtMealTime([scored()], MEAL_TIME)).toHaveLength(1);
  });

  it("drops places that are closed at the meal time", () => {
    // MEAL_TIME is 12:00 local; this place opens at 17:00.
    const dinnerOnly = scored({ raw: { periods: openDaily(17, 23) } });
    expect(filterOpenAtMealTime([dinnerOnly], MEAL_TIME)).toEqual([]);
  });

  it("drops places with no opening hours", () => {
    expect(filterOpenAtMealTime([scored({ raw: { periods: [] } })], MEAL_TIME)).toEqual([]);
  });

  it("ignores whether the place is open right now", () => {
    const closedNowOpenAtMeal = scored({ open_now: false });
    expect(filterOpenAtMealTime([closedNowOpenAtMeal], MEAL_TIME)).toHaveLength(1);
  });
});

describe("filterByBudget", () => {
  const prices = [0, 1, 2, 3, 4].map((price_level) => scored({ price_level }));

  it("keeps only places inside the range, ends included", () => {
    const kept = filterByBudget(prices, { min: 1, max: 3 }).map((p) => p.price_level);
    expect(kept).toEqual([1, 2, 3]);
  });

  it("keeps places with no price level", () => {
    const unknown = scored({ price_level: null });
    expect(filterByBudget([unknown], { min: 1, max: 2 })).toEqual([unknown]);
  });

  it("keeps everything when there is no budget", () => {
    expect(filterByBudget(prices, null)).toHaveLength(5);
  });
});

describe("filterRefusedCuisines", () => {
  it("drops a place tagged with a refused cuisine", () => {
    const thai = scored({ cuisine_tags: ["thai"] });
    const pizza = scored({ cuisine_tags: ["pizza"] });
    expect(filterRefusedCuisines([thai, pizza], ["thai"])).toEqual([pizza]);
  });

  it("drops a place if any one of its tags is refused", () => {
    const sushi = scored({ cuisine_tags: ["japanese", "sushi"] });
    expect(filterRefusedCuisines([sushi], ["japanese"])).toEqual([]);
  });

  it("keeps places with no cuisine tags", () => {
    const plain = scored({ cuisine_tags: [] });
    expect(filterRefusedCuisines([plain], ["thai"])).toEqual([plain]);
  });

  it("keeps everything when nothing is refused", () => {
    expect(filterRefusedCuisines([scored({ cuisine_tags: ["thai"] })], [])).toHaveLength(1);
  });
});

describe("filterWantedCuisines", () => {
  const thai = scored({ cuisine_tags: ["thai"] });
  const pizza = scored({ cuisine_tags: ["pizza", "italian"] });
  const french = scored({ cuisine_tags: ["french"] });
  const untagged = scored({ cuisine_tags: [] });

  it("keeps only places that match a wanted cuisine", () => {
    expect(filterWantedCuisines([thai, pizza, french], ["thai", "pizza"])).toEqual([thai, pizza]);
  });

  it("drops places nobody asked for, including places with no cuisine tag", () => {
    expect(filterWantedCuisines([french, untagged], ["thai"])).toEqual([]);
  });

  it("matches on any one of a place's tags", () => {
    expect(filterWantedCuisines([pizza], ["italian"])).toEqual([pizza]);
  });

  it("keeps everything when nobody wants a specific cuisine", () => {
    expect(filterWantedCuisines([thai, french, untagged], [])).toHaveLength(3);
  });
});

describe("sortAndCapBalanced", () => {
  const many = (n: number, tag: "thai" | "pizza", startMeters: number) =>
    Array.from({ length: n }, (_, i) =>
      scored({ meters: startMeters + i, cuisine_tags: [tag] }),
    );

  it("keeps a scarce cuisine even when a popular one would fill the cap", () => {
    const thai = many(30, "thai", 100);
    const pizza = many(5, "pizza", 1000); // all farther than every Thai place
    const result = sortAndCapBalanced([...thai, ...pizza], ["thai", "pizza"], 25);

    expect(result).toHaveLength(25);
    expect(result.filter((p) => p.cuisine_tags.includes("pizza"))).toHaveLength(5);
    expect(result.filter((p) => p.cuisine_tags.includes("thai"))).toHaveLength(20);
  });

  it("returns the result nearest first", () => {
    const result = sortAndCapBalanced(
      [...many(30, "thai", 100), ...many(5, "pizza", 1000)],
      ["thai", "pizza"],
      25,
    );
    const distances = result.map((p) => p.distance_m);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("matches plain sortAndCap with one wanted cuisine", () => {
    const places = many(30, "thai", 100);
    expect(sortAndCapBalanced(places, ["thai"], 25)).toEqual(sortAndCap(places, 25));
  });

  it("matches plain sortAndCap when everything fits", () => {
    const places = [...many(4, "thai", 100), ...many(3, "pizza", 500)];
    expect(sortAndCapBalanced(places, ["thai", "pizza"], 25)).toEqual(sortAndCap(places, 25));
  });
});

describe("sortAndCap", () => {
  it("sorts nearest first, then by rating", () => {
    const a = scored({ meters: 500, rating: 3.9 });
    const b = scored({ meters: 500, rating: 4.7 });
    const c = scored({ meters: 100, rating: 3.0 });
    expect(sortAndCap([a, b, c]).map((p) => p.place_id)).toEqual([c, b, a].map((p) => p.place_id));
  });

  it("puts unrated places after rated ones at the same distance", () => {
    const unrated = { ...scored({ rating: null }), distance_m: 300 };
    const rated = { ...scored({ rating: 2.0 }), distance_m: 300 };
    expect(sortAndCap([unrated, rated])[0].place_id).toBe(rated.place_id);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 40 }, () => scored());
    expect(sortAndCap(many, 25)).toHaveLength(25);
  });
});

describe("selectCandidates", () => {
  it("applies every filter and reports what each one removed", () => {
    const places = [
      makePlace({ meters: 300 }),
      makePlace({ meters: 400 }),
      makePlace({ meters: 500 }),
      makePlace({ meters: 5000 }), // outside the radius
      makePlace({ meters: 200, raw: { periods: openDaily(17, 23) } }), // closed at the meal
      makePlace({ meters: 200, price_level: 4 }), // over budget
      makePlace({ meters: 200, cuisine_tags: ["seafood"] }), // refused
    ];
    const result = selectCandidates(
      places,
      ctx({ budget: { min: 1, max: 2 }, refusedCuisines: ["seafood"] }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toHaveLength(3);
    expect(result.dropped).toEqual({
      outside_radius: 1,
      closed_at_meal_time: 1,
      outside_budget: 1,
      refused_cuisine: 1,
      no_wanted_cuisine: 0,
    });
  });

  it("returns candidates nearest first", () => {
    const places = [makePlace({ meters: 900 }), makePlace({ meters: 100 }), makePlace({ meters: 500 })];
    const result = selectCandidates(places, ctx());
    const distances = result.ok ? result.candidates.map((c) => c.distance_m) : [];
    expect(distances).toHaveLength(3);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("caps the result at 25", () => {
    const places = Array.from({ length: 30 }, (_, i) => makePlace({ meters: 100 + i }));
    const result = selectCandidates(places, ctx());
    expect(result.ok && result.candidates).toHaveLength(25);
  });

  it("fails with advice to widen the radius or budget when fewer than 3 remain", () => {
    const places = [makePlace(), makePlace(), makePlace({ meters: 9000 })];
    const result = selectCandidates(places, ctx());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("too_few_candidates");
    expect(result.found).toBe(2);
    expect(result.message).toMatch(/widening the radius, the budget or the cuisines/);
  });

  it("succeeds with exactly 3", () => {
    const places = [makePlace(), makePlace(), makePlace()];
    expect(selectCandidates(places, ctx()).ok).toBe(true);
  });

  it("fails with no places at all", () => {
    const result = selectCandidates([], ctx());
    expect(result.ok).toBe(false);
  });

  it("drops neutral places when the group wants specific cuisines", () => {
    const places = [
      makePlace({ cuisine_tags: ["thai"] }),
      makePlace({ cuisine_tags: ["thai"] }),
      makePlace({ cuisine_tags: ["pizza"] }),
      makePlace({ cuisine_tags: ["french"] }), // nobody picked this
      makePlace({ cuisine_tags: [] }), // no cuisine information
    ];
    const result = selectCandidates(places, ctx({ wantedCuisines: ["thai", "pizza"] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toHaveLength(3);
    expect(result.dropped.no_wanted_cuisine).toBe(2);
  });
});
