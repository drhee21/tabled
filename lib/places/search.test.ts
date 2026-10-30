import { describe, expect, it, vi } from "vitest";
import type { CuisineValue } from "../preference-options";
import { annotate } from "./filters";
import {
  MAX_FOLLOW_UP_CALLS,
  VARIETY_BIAS_THRESHOLD,
  dominantCuisine,
  rankWantedCuisines,
  searchCandidates,
  type ParticipantAnswers,
} from "./search";
import {
  CENTER,
  MEAL_TIME,
  makePlace,
  mockProvider,
  openDaily,
  scriptedProvider,
} from "./test-fixtures";
import { PlacesProviderError, type PlacesProvider } from "./types";

const session = {
  lat: CENTER.lat,
  lng: CENTER.lng,
  radius_m: 1500,
  meal_time: MEAL_TIME.toISOString(),
};

const person = (overrides: Partial<ParticipantAnswers> = {}): ParticipantAnswers => ({
  display_name: "Sam",
  dietary: [],
  budget_min: null,
  budget_max: null,
  cuisines_want: [],
  cuisines_avoid: [],
  ...overrides,
});

const fiveGoodPlaces = () => Array.from({ length: 5 }, () => makePlace());

/** `n` open, nearby places of one cuisine. */
const ofCuisine = (cuisine: CuisineValue, n: number) =>
  Array.from({ length: n }, () => makePlace({ cuisine_tags: [cuisine] }));

describe("searchCandidates", () => {
  it("calls the provider once with the session location and the group's cuisines", async () => {
    const provider = mockProvider(fiveGoodPlaces());
    await searchCandidates(provider, {
      session,
      participants: [
        person({ cuisines_want: ["thai", "pizza"], cuisines_avoid: ["seafood"] }),
        person({ cuisines_want: ["thai"], cuisines_avoid: ["seafood", "bbq"] }),
      ],
    });

    expect(provider.calls).toEqual([
      {
        lat: CENTER.lat,
        lng: CENTER.lng,
        radius_m: 1500,
        wantedCuisines: ["thai", "pizza"],
        refusedCuisines: ["seafood", "bbq"],
      },
    ]);
  });

  it("filters refused cuisines in code even if the provider returns them", async () => {
    const places = [...fiveGoodPlaces(), makePlace({ cuisine_tags: ["seafood"] })];
    const result = await searchCandidates(mockProvider(places), {
      session,
      participants: [person({ cuisines_avoid: ["seafood"] })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates.some((c) => c.cuisine_tags.includes("seafood"))).toBe(false);
    expect(result.dropped.refused_cuisine).toBe(1);
  });

  it("drops neutral places when someone wants specific cuisines", async () => {
    const places = [...ofCuisine("thai", 3), ...ofCuisine("french", 2), makePlace()];
    const result = await searchCandidates(mockProvider(places), {
      session,
      participants: [person({ cuisines_want: ["thai"] })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.every((c) => c.cuisine_tags.includes("thai"))).toBe(true);
    expect(result.dropped.no_wanted_cuisine).toBe(3);
  });

  it("does not ask for a cuisine that one person wants and another refuses", async () => {
    const provider = mockProvider(ofCuisine("pizza", 4));
    await searchCandidates(provider, {
      session,
      participants: [
        person({ cuisines_want: ["thai", "pizza"] }),
        person({ cuisines_avoid: ["thai"] }),
      ],
    });
    expect(provider.calls[0].wantedCuisines).toEqual(["pizza"]);
  });

  it("stops without calling Google when everything wanted is refused", async () => {
    const provider = mockProvider(fiveGoodPlaces());
    const result = await searchCandidates(provider, {
      session,
      participants: [person({ cuisines_want: ["thai"] }), person({ cuisines_avoid: ["thai"] })],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("no_wanted_cuisine_left");
    expect(result.provider_calls).toBe(0);
    expect(provider.calls).toHaveLength(0);
  });

  it("respects the group budget, radius and meal time", async () => {
    const places = [
      ...fiveGoodPlaces(),
      makePlace({ price_level: 4 }),
      makePlace({ meters: 8000 }),
      makePlace({ raw: { periods: openDaily(17, 23) } }),
    ];
    const result = await searchCandidates(mockProvider(places), {
      session,
      participants: [person({ budget_min: 1, budget_max: 2 })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toHaveLength(5);
    expect(result.dropped).toMatchObject({
      outside_budget: 1,
      outside_radius: 1,
      closed_at_meal_time: 1,
    });
  });

  it("searches the middle ground when budgets do not overlap, and says who was left out", async () => {
    const places = [
      makePlace({ price_level: 1 }),
      makePlace({ price_level: 1 }),
      makePlace({ price_level: 1 }),
      makePlace({ price_level: 4 }),
    ];
    const result = await searchCandidates(mockProvider(places), {
      session,
      participants: [
        person({ display_name: "Ana", budget_min: 1, budget_max: 2 }),
        person({ display_name: "Ben", budget_min: 1, budget_max: 1 }),
        person({ display_name: "Cleo", budget_min: 4, budget_max: 4 }),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.budget).toEqual({ min: 1, max: 1, unanimous: false, left_out: ["Cleo"] });
    expect(result.candidates.every((c) => c.price_level === 1)).toBe(true);
  });

  it("marks places dietary_unknown when the data cannot confirm a need", async () => {
    const result = await searchCandidates(mockProvider(fiveGoodPlaces()), {
      session,
      participants: [person({ dietary: ["gluten-free"] })],
    });
    expect(result.ok && result.candidates.every((c) => c.dietary_unknown)).toBe(true);
  });

  it("applies no filters when nobody has answered", async () => {
    const result = await searchCandidates(mockProvider(fiveGoodPlaces()), {
      session,
      participants: [],
    });
    expect(result.ok && result.candidates).toHaveLength(5);
    expect(result.ok && result.budget).toBeNull();
  });

  it("fails with advice when too few places remain, and still reports the budget", async () => {
    const result = await searchCandidates(mockProvider([makePlace(), makePlace()]), {
      session,
      participants: [person({ budget_min: 1, budget_max: 2 })],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/widening the radius, the budget or the cuisines/);
    expect(result.budget).toMatchObject({ min: 1, max: 2 });
    expect(result.provider_calls).toBe(1);
  });

  it("lets a first-call failure through so the route can give the search back", async () => {
    const failing: PlacesProvider = {
      async search() {
        throw new PlacesProviderError("Places service returned 500", 500);
      },
    };
    await expect(
      searchCandidates(failing, { session, participants: [person()] }),
    ).rejects.toBeInstanceOf(PlacesProviderError);
  });
});

describe("variety across wanted cuisines", () => {
  // Two people want Thai, one wants pizza, one wants Korean.
  const group = [
    person({ cuisines_want: ["thai", "pizza"] }),
    person({ cuisines_want: ["thai", "korean"] }),
  ];

  it("makes a single call when the first results are balanced", async () => {
    const provider = scriptedProvider(() => [
      ...ofCuisine("thai", 3),
      ...ofCuisine("pizza", 3),
      ...ofCuisine("korean", 3),
    ]);
    const result = await searchCandidates(provider, { session, participants: group });

    expect(provider.calls).toHaveLength(1);
    expect(result.ok && result.provider_calls).toBe(1);
    expect(result.ok && result.follow_up_cuisines).toEqual([]);
  });

  it("asks for the other wanted cuisines by name when one cuisine dominates", async () => {
    const provider = scriptedProvider((params) => {
      if (params.wantedCuisines.length > 1) return ofCuisine("thai", 8);
      return ofCuisine(params.wantedCuisines[0], 4);
    });
    const result = await searchCandidates(provider, { session, participants: group });

    // The first call counts as Thai's call; Korean and pizza get one each, in that order.
    expect(provider.calls.map((c) => c.wantedCuisines)).toEqual([
      ["thai", "korean", "pizza"],
      ["korean"],
      ["pizza"],
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider_calls).toBe(3);
    expect(result.follow_up_cuisines).toEqual(["korean", "pizza"]);
    expect(new Set(result.candidates.flatMap((c) => c.cuisine_tags))).toEqual(
      new Set(["thai", "korean", "pizza"]),
    );
  });

  it("never makes more than two follow-up calls", async () => {
    const provider = scriptedProvider((params) =>
      params.wantedCuisines.length > 1 ? ofCuisine("thai", 8) : ofCuisine(params.wantedCuisines[0], 3),
    );
    await searchCandidates(provider, {
      session,
      participants: [
        person({ cuisines_want: ["thai", "pizza", "korean", "indian", "mexican"] }),
      ],
    });

    expect(MAX_FOLLOW_UP_CALLS).toBe(2);
    expect(provider.calls).toHaveLength(1 + MAX_FOLLOW_UP_CALLS);
  });

  it("makes no follow-up call when only one cuisine is wanted", async () => {
    const provider = scriptedProvider(() => ofCuisine("thai", 6));
    await searchCandidates(provider, {
      session,
      participants: [person({ cuisines_want: ["thai"] })],
    });
    expect(provider.calls).toHaveLength(1);
  });

  it("counts a place returned by two calls once", async () => {
    const shared = makePlace({ cuisine_tags: ["thai", "korean"] });
    const provider = scriptedProvider((params) =>
      params.wantedCuisines.length > 1
        ? [shared, ...ofCuisine("thai", 6)]
        : [shared, ...ofCuisine(params.wantedCuisines[0], 2)],
    );
    const result = await searchCandidates(provider, { session, participants: group });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.candidates.map((c) => c.place_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the first call's results if a follow-up call fails", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = scriptedProvider((params) => {
      if (params.wantedCuisines.length > 1) return ofCuisine("thai", 8);
      throw new PlacesProviderError("Places service returned 503", 503);
    });
    const result = await searchCandidates(provider, { session, participants: group });
    warn.mockRestore();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toHaveLength(8);
    expect(result.follow_up_cuisines).toEqual([]);
  });

  it("does not follow up when the first call found nothing usable", async () => {
    const provider = scriptedProvider(() => []);
    const result = await searchCandidates(provider, { session, participants: group });
    expect(provider.calls).toHaveLength(1);
    expect(result.ok).toBe(false);
  });
});

describe("dominantCuisine", () => {
  const survivors = (thai: number, pizza: number) =>
    annotate([...ofCuisine("thai", thai), ...ofCuisine("pizza", pizza)], {
      center: CENTER,
      dietary: [],
    });

  it("uses a 70% threshold", () => {
    expect(VARIETY_BIAS_THRESHOLD).toBe(0.7);
  });

  it("flags a cuisine at exactly the threshold", () => {
    expect(dominantCuisine(survivors(7, 3), ["thai", "pizza"])).toBe("thai");
  });

  it("does not flag a cuisine just under the threshold", () => {
    expect(dominantCuisine(survivors(6, 4), ["thai", "pizza"])).toBeNull();
  });

  it("flags the smaller wanted cuisine if it is the one hogging the results", () => {
    expect(dominantCuisine(survivors(1, 9), ["thai", "pizza"])).toBe("pizza");
  });

  it("is null with one wanted cuisine or no survivors", () => {
    expect(dominantCuisine(survivors(5, 0), ["thai"])).toBeNull();
    expect(dominantCuisine([], ["thai", "pizza"])).toBeNull();
  });

  it("counts a place that matches two wanted cuisines toward both", () => {
    const both = annotate(
      Array.from({ length: 4 }, () => makePlace({ cuisine_tags: ["thai", "pizza"] })),
      { center: CENTER, dietary: [] },
    );
    expect(dominantCuisine(both, ["thai", "pizza"])).toBe("thai");
  });
});

describe("rankWantedCuisines", () => {
  it("orders by how many people want each, then alphabetically", () => {
    const ranked = rankWantedCuisines(
      [
        person({ cuisines_want: ["thai", "pizza"] }),
        person({ cuisines_want: ["thai", "korean"] }),
        person({ cuisines_want: ["korean"] }),
      ],
      [],
    );
    expect(ranked).toEqual(["korean", "thai", "pizza"]);
  });

  it("leaves out refused cuisines", () => {
    expect(rankWantedCuisines([person({ cuisines_want: ["thai", "pizza"] })], ["thai"])).toEqual([
      "pizza",
    ]);
  });
});
