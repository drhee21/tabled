import { describe, expect, it } from "vitest";
import { CUISINE_VALUES, DIETARY_VALUES } from "../preference-options";
import {
  CUISINE_TYPES,
  DIETARY_TYPES,
  MAX_TYPES_PER_LIST,
  cuisineTagsFromTypes,
  dietaryConfirmedFromTypes,
  isDeliveryOnly,
  isFoodPlace,
  searchTypes,
} from "./google-types";

describe("cuisine map", () => {
  it("gives every cuisine option at least one Google type", () => {
    for (const cuisine of CUISINE_VALUES) {
      expect(CUISINE_TYPES[cuisine].length, cuisine).toBeGreaterThan(0);
    }
  });

  it("only uses lowercase Google type names", () => {
    for (const types of Object.values(CUISINE_TYPES)) {
      for (const t of types) expect(t).toMatch(/^[a-z_]+$/);
    }
  });

  it("tags a sushi place as both Japanese and sushi", () => {
    expect(cuisineTagsFromTypes(["sushi_restaurant", "restaurant", "food"])).toEqual([
      "japanese",
      "sushi",
    ]);
  });

  it("tags nothing for a generic restaurant", () => {
    expect(cuisineTagsFromTypes(["restaurant", "food", "point_of_interest"])).toEqual([]);
  });
});

describe("isFoodPlace", () => {
  it("accepts restaurants of any kind, cafes and bakeries", () => {
    for (const t of ["restaurant", "french_restaurant", "sandwich_shop", "cafe", "bakery"]) {
      expect(isFoodPlace(t), t).toBe(true);
    }
  });

  it("rejects places whose main type is not food", () => {
    for (const t of ["parking_garage", "hotel", "gas_station", "corporate_office"]) {
      expect(isFoodPlace(t), t).toBe(false);
    }
  });

  it("accepts a place with no main type", () => {
    expect(isFoodPlace(undefined)).toBe(true);
  });

  it("covers every type the cuisine map relies on", () => {
    const mapped = Object.values(CUISINE_TYPES).flat();
    for (const t of mapped) expect(isFoodPlace(t), t).toBe(true);
  });
});

describe("isDeliveryOnly", () => {
  it("flags places whose main type is delivery only", () => {
    expect(isDeliveryOnly("pizza_delivery")).toBe(true);
    expect(isDeliveryOnly("meal_delivery")).toBe(true);
  });

  it("keeps takeout places and ordinary restaurants", () => {
    expect(isDeliveryOnly("meal_takeaway")).toBe(false);
    expect(isDeliveryOnly("pizza_restaurant")).toBe(false);
    expect(isDeliveryOnly("restaurant")).toBe(false);
  });

  it("does not flag a place with no main type", () => {
    expect(isDeliveryOnly(undefined)).toBe(false);
  });
});

describe("dietary map", () => {
  it("confirms vegetarian, vegan and pescatarian from a vegan restaurant", () => {
    expect(dietaryConfirmedFromTypes(["vegan_restaurant"])).toEqual([
      "vegan",
      "vegetarian",
      "pescatarian",
    ]);
  });

  it("confirms halal only from a halal restaurant", () => {
    expect(dietaryConfirmedFromTypes(["halal_restaurant"])).toEqual(["halal"]);
    expect(dietaryConfirmedFromTypes(["restaurant"])).toEqual([]);
  });

  it("never confirms needs Google has no types for", () => {
    const unconfirmable = DIETARY_VALUES.filter((d) => !(d in DIETARY_TYPES));
    expect(unconfirmable).toEqual(["gluten-free", "dairy-free", "nut-free", "kosher"]);
    const everyType = Object.values(DIETARY_TYPES).flat() as string[];
    for (const d of unconfirmable) {
      expect(dietaryConfirmedFromTypes(everyType)).not.toContain(d);
    }
  });
});

describe("searchTypes", () => {
  it("asks for restaurants in general when nobody wants a specific cuisine", () => {
    expect(searchTypes([], [])).toEqual({ includedTypes: ["restaurant"], excludedTypes: [] });
  });

  it("asks only for the wanted cuisines' types, not for restaurants in general", () => {
    const { includedTypes } = searchTypes(["thai", "pizza"], []);
    expect(includedTypes).toEqual(["thai_restaurant", "pizza_restaurant"]);
    expect(includedTypes).not.toContain("restaurant");
  });

  it("includes every type in a cuisine family", () => {
    expect(searchTypes(["korean"], []).includedTypes).toEqual([
      "korean_restaurant",
      "korean_barbecue_restaurant",
    ]);
  });

  it("asks for cafe types when a cafe is wanted", () => {
    expect(searchTypes(["cafe"], []).includedTypes).toEqual(["cafe", "coffee_shop"]);
  });

  it("excludes the types of refused cuisines", () => {
    const { excludedTypes } = searchTypes([], ["thai", "sushi"]);
    expect(excludedTypes).toEqual(expect.arrayContaining(["thai_restaurant", "sushi_restaurant"]));
  });

  it("never lists a type in both lists, so Google does not reject the request", () => {
    // Someone wants sushi, someone refuses Japanese (which includes sushi).
    const { includedTypes, excludedTypes } = searchTypes(["sushi", "thai"], ["japanese"]);
    expect(includedTypes).toEqual(["thai_restaurant"]);
    expect(includedTypes.filter((t) => excludedTypes.includes(t))).toEqual([]);
  });

  it("returns nothing to ask for when every wanted cuisine is refused", () => {
    expect(searchTypes(["thai"], ["thai"]).includedTypes).toEqual([]);
  });

  it("stays within Google's limit even if everything is wanted or refused", () => {
    expect(searchTypes([...CUISINE_VALUES], []).includedTypes.length).toBeLessThanOrEqual(
      MAX_TYPES_PER_LIST,
    );
    expect(searchTypes([], [...CUISINE_VALUES]).excludedTypes.length).toBeLessThanOrEqual(
      MAX_TYPES_PER_LIST,
    );
  });
});
