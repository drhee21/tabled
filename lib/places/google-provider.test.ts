import { describe, expect, it, vi } from "vitest";
import {
  PLACES_FIELD_MASK,
  createGooglePlacesProvider,
  toCandidate,
} from "./google-provider";
import { PlacesProviderError, type PlacesSearchParams } from "./types";

// Nothing in this file touches the network: fetch is always a stub.

const TEST_KEY = "test-key-not-real";

const params: PlacesSearchParams = {
  lat: 37.7749,
  lng: -122.4194,
  radius_m: 1500,
  wantedCuisines: [],
  refusedCuisines: [],
};

/** Shaped like a real Nearby Search response. Zero values are left out, as Google does. */
const RESPONSE = {
  places: [
    {
      id: "ChIJfull",
      displayName: { text: "Full Data Bistro", languageCode: "en" },
      formattedAddress: "10 Market St, San Francisco, CA",
      location: { latitude: 37.78, longitude: -122.41 },
      types: ["italian_restaurant", "restaurant", "food"],
      primaryType: "italian_restaurant",
      utcOffsetMinutes: -420,
      priceLevel: "PRICE_LEVEL_MODERATE",
      rating: 4.6,
      currentOpeningHours: {
        openNow: true,
        periods: [
          // Sunday 10:00 to 22:00: day 0 and minute 0 are absent from the JSON.
          { open: { hour: 10 }, close: { hour: 22 } },
          { open: { day: 5, hour: 9, minute: 30 }, close: { day: 6, hour: 2 } },
        ],
      },
    },
    {
      id: "ChIJsparse",
      displayName: { text: "Sparse Data Cafe" },
      location: { latitude: 37.77, longitude: -122.42 },
      types: ["vegan_restaurant"],
    },
    {
      id: "ChIJalways",
      displayName: { text: "Always Open" },
      location: { latitude: 37.771, longitude: -122.421 },
      priceLevel: "PRICE_LEVEL_FREE",
      currentOpeningHours: { periods: [{ open: {} }] },
    },
    // Real shapes from a live search: not restaurants, but Google lists "restaurant" too.
    {
      id: "ChIJgarage",
      displayName: { text: "Main Garage" },
      location: { latitude: 37.785, longitude: -122.43 },
      types: ["parking_garage", "parking", "japanese_restaurant", "restaurant", "food"],
      primaryType: "parking_garage",
    },
    {
      id: "ChIJhotel",
      displayName: { text: "Union Square Hotel" },
      location: { latitude: 37.788, longitude: -122.407 },
      types: ["hotel", "lodging", "restaurant", "food"],
      primaryType: "hotel",
    },
    // Real shape from a live search: a delivery-only chain location.
    {
      id: "ChIJdelivery",
      displayName: { text: "Delivery Pizza" },
      location: { latitude: 37.775, longitude: -122.41 },
      types: ["pizza_delivery", "pizza_restaurant", "meal_delivery", "restaurant", "food"],
      primaryType: "pizza_delivery",
    },
    { id: "ChIJnoloc", displayName: { text: "No Location" } },
    { displayName: { text: "No Id" }, location: { latitude: 1, longitude: 1 } },
  ],
};

function stubFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("PLACES_FIELD_MASK", () => {
  const fields = PLACES_FIELD_MASK.split(",");

  // The most expensive tier a field belongs to. The mask must never pass Enterprise.
  const ALLOWED: Record<string, "pro" | "enterprise"> = {
    "places.id": "pro",
    "places.displayName": "pro",
    "places.formattedAddress": "pro",
    "places.location": "pro",
    "places.types": "pro",
    "places.primaryType": "pro",
    "places.utcOffsetMinutes": "pro",
    "places.priceLevel": "enterprise",
    "places.rating": "enterprise",
    "places.currentOpeningHours": "enterprise",
  };

  it("requests only fields we have classified", () => {
    for (const f of fields) expect(ALLOWED, f).toHaveProperty(f);
  });

  it("never requests reviews or photos", () => {
    expect(PLACES_FIELD_MASK).not.toMatch(/review|photo/i);
  });

  it("stays at the Enterprise tier and never reaches Atmosphere", () => {
    const tiers = new Set(fields.map((f) => ALLOWED[f]));
    expect(tiers.has("enterprise")).toBe(true);
    expect(PLACES_FIELD_MASK).not.toMatch(/serves|allows|takeout|delivery|dineIn|editorial/i);
  });

  it("has no spaces, as Google requires", () => {
    expect(PLACES_FIELD_MASK).not.toContain(" ");
  });
});

describe("createGooglePlacesProvider", () => {
  it("sends the key, the field mask and a circle around the session location", async () => {
    const fetchImpl = stubFetch(RESPONSE);
    await createGooglePlacesProvider({ apiKey: TEST_KEY, fetchImpl }).search(params);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe(TEST_KEY);
    expect(headers["X-Goog-FieldMask"]).toBe(PLACES_FIELD_MASK);

    expect(JSON.parse(init.body as string)).toMatchObject({
      includedTypes: ["restaurant"],
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      locationRestriction: {
        circle: { center: { latitude: 37.7749, longitude: -122.4194 }, radius: 1500 },
      },
    });
  });

  it("excludes refused cuisines in the request", async () => {
    const fetchImpl = stubFetch({ places: [] });
    await createGooglePlacesProvider({ apiKey: TEST_KEY, fetchImpl }).search({
      ...params,
      refusedCuisines: ["italian"],
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).excludedTypes).toContain("italian_restaurant");
  });

  it("skips a parking garage and a hotel that merely list restaurant among their types", async () => {
    const places = await createGooglePlacesProvider({
      apiKey: TEST_KEY,
      fetchImpl: stubFetch(RESPONSE),
    }).search(params);
    expect(places.map((p) => p.name)).not.toContain("Main Garage");
    expect(places.map((p) => p.name)).not.toContain("Union Square Hotel");
  });

  it("asks Google only for the wanted cuisines' types", async () => {
    const fetchImpl = stubFetch({ places: [] });
    await createGooglePlacesProvider({ apiKey: TEST_KEY, fetchImpl }).search({
      ...params,
      wantedCuisines: ["thai", "pizza"],
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).includedTypes).toEqual([
      "thai_restaurant",
      "pizza_restaurant",
    ]);
  });

  it("makes no request at all when every wanted cuisine is refused", async () => {
    const fetchImpl = stubFetch(RESPONSE);
    const places = await createGooglePlacesProvider({ apiKey: TEST_KEY, fetchImpl }).search({
      ...params,
      wantedCuisines: ["thai"],
      refusedCuisines: ["thai"],
    });
    expect(places).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips a delivery-only place even though it is tagged as a pizza restaurant", async () => {
    const places = await createGooglePlacesProvider({
      apiKey: TEST_KEY,
      fetchImpl: stubFetch(RESPONSE),
    }).search(params);
    expect(places.map((p) => p.name)).not.toContain("Delivery Pizza");
  });

  it("returns places in the candidates shape and skips ones missing an id or location", async () => {
    const places = await createGooglePlacesProvider({
      apiKey: TEST_KEY,
      fetchImpl: stubFetch(RESPONSE),
    }).search(params);

    expect(places.map((p) => p.place_id)).toEqual(["ChIJfull", "ChIJsparse", "ChIJalways"]);
  });

  it("maps a fully populated place", async () => {
    const [full] = await createGooglePlacesProvider({
      apiKey: TEST_KEY,
      fetchImpl: stubFetch(RESPONSE),
    }).search(params);

    expect(full).toMatchObject({
      name: "Full Data Bistro",
      address: "10 Market St, San Francisco, CA",
      lat: 37.78,
      lng: -122.41,
      price_level: 2,
      cuisine_tags: ["italian"],
      rating: 4.6,
      open_now: true,
    });
    expect(full.raw.utc_offset_minutes).toBe(-420);
    expect(full.raw.primary_type).toBe("italian_restaurant");
  });

  it("fills in zero values that Google leaves out of opening hours", async () => {
    const [full] = await createGooglePlacesProvider({
      apiKey: TEST_KEY,
      fetchImpl: stubFetch(RESPONSE),
    }).search(params);

    expect(full.raw.periods).toEqual([
      { open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 22, minute: 0 } },
      { open: { day: 5, hour: 9, minute: 30 }, close: { day: 6, hour: 2, minute: 0 } },
    ]);
  });

  it("uses null for missing price, rating, address and open status", async () => {
    const places = await createGooglePlacesProvider({
      apiKey: TEST_KEY,
      fetchImpl: stubFetch(RESPONSE),
    }).search(params);
    const sparse = places[1];

    expect(sparse).toMatchObject({
      price_level: null,
      rating: null,
      address: null,
      open_now: null,
      cuisine_tags: [],
    });
    expect(sparse.raw.periods).toEqual([]);
    expect(sparse.raw.dietary_confirmed).toEqual(["vegan", "vegetarian", "pescatarian"]);
  });

  it("maps a free place to price level 0 and an always-open place to no close time", async () => {
    const places = await createGooglePlacesProvider({
      apiKey: TEST_KEY,
      fetchImpl: stubFetch(RESPONSE),
    }).search(params);
    const always = places[2];

    expect(always.price_level).toBe(0);
    expect(always.raw.periods).toEqual([
      { open: { day: 0, hour: 0, minute: 0 }, close: null },
    ]);
  });

  it("returns an empty list when Google finds nothing", async () => {
    const places = await createGooglePlacesProvider({
      apiKey: TEST_KEY,
      fetchImpl: stubFetch({}),
    }).search(params);
    expect(places).toEqual([]);
  });

  it("throws a PlacesProviderError with the status when Google rejects the request", async () => {
    const provider = createGooglePlacesProvider({
      apiKey: TEST_KEY,
      fetchImpl: stubFetch({ error: { message: "API key not valid" } }, 403),
    });
    const err = await provider.search(params).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PlacesProviderError);
    expect((err as PlacesProviderError).status).toBe(403);
  });

  it("throws a PlacesProviderError with no status on a network failure, without leaking the key", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError(`fetch failed for key ${TEST_KEY}`);
    });
    const err = await createGooglePlacesProvider({ apiKey: TEST_KEY, fetchImpl })
      .search(params)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PlacesProviderError);
    expect((err as PlacesProviderError).status).toBeNull();
    expect((err as PlacesProviderError).message).not.toContain(TEST_KEY);
  });
});

describe("toCandidate", () => {
  it("returns null without a name", () => {
    expect(toCandidate({ id: "x", location: { latitude: 1, longitude: 2 } })).toBeNull();
  });

  it("maps an unspecified price level to null", () => {
    const place = toCandidate({
      id: "x",
      displayName: { text: "X" },
      location: { latitude: 1, longitude: 2 },
      priceLevel: "PRICE_LEVEL_UNSPECIFIED",
    });
    expect(place?.price_level).toBeNull();
  });
});
