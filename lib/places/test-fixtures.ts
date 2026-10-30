// Fixture data for tests only. Nothing here calls a real API.
import type {
  OpeningPeriod,
  PlaceCandidate,
  PlacesProvider,
  PlacesSearchParams,
} from "./types";

/** Downtown San Francisco. */
export const CENTER = { lat: 37.7749, lng: -122.4194 };

/** Friday 12:00 in San Francisco (UTC-7). */
export const MEAL_TIME = new Date("2026-10-30T19:00:00Z");
export const PDT_OFFSET_MINUTES = -420;

const METERS_PER_DEGREE_LAT = 111_195;

/** A point roughly this many meters north of the center. */
export function northOfCenter(meters: number): { lat: number; lng: number } {
  return { lat: CENTER.lat + meters / METERS_PER_DEGREE_LAT, lng: CENTER.lng };
}

/** Open from `fromHour` to `toHour` on every day of the week. */
export function openDaily(fromHour = 9, toHour = 22): OpeningPeriod[] {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    open: { day, hour: fromHour, minute: 0 },
    close: { day, hour: toHour, minute: 0 },
  }));
}

let counter = 0;

/** A valid candidate, open at MEAL_TIME, 200 m from the center. Override what a test cares about. */
export function makePlace(
  overrides: Partial<Omit<PlaceCandidate, "raw">> & {
    meters?: number;
    raw?: Partial<PlaceCandidate["raw"]>;
  } = {},
): PlaceCandidate {
  counter += 1;
  const { meters = 200, raw, ...rest } = overrides;
  return {
    place_id: `place-${counter}`,
    name: `Place ${counter}`,
    address: "1 Test St",
    ...northOfCenter(meters),
    price_level: 2,
    cuisine_tags: [],
    rating: 4.2,
    open_now: true,
    ...rest,
    raw: {
      types: ["restaurant"],
      primary_type: "restaurant",
      utc_offset_minutes: PDT_OFFSET_MINUTES,
      periods: openDaily(),
      dietary_confirmed: [],
      ...raw,
    },
  };
}

/** A provider that returns fixed places and records its calls. */
export function mockProvider(places: PlaceCandidate[]): PlacesProvider & {
  calls: Parameters<PlacesProvider["search"]>[0][];
} {
  const calls: Parameters<PlacesProvider["search"]>[0][] = [];
  return {
    calls,
    async search(params) {
      calls.push(params);
      return places;
    },
  };
}

/** A provider whose answer depends on the request. Throw from `respond` to simulate a failure. */
export function scriptedProvider(
  respond: (params: PlacesSearchParams, callNumber: number) => PlaceCandidate[],
): PlacesProvider & { calls: PlacesSearchParams[] } {
  const calls: PlacesSearchParams[] = [];
  return {
    calls,
    async search(params) {
      calls.push(params);
      return respond(params, calls.length);
    },
  };
}
