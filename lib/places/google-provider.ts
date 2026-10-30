// The only module that talks to Google Places. Everything else goes through
// the PlacesProvider interface in ./types.
import {
  cuisineTagsFromTypes,
  dietaryConfirmedFromTypes,
  isDeliveryOnly,
  isFoodPlace,
  searchTypes,
} from "./google-types";
import {
  PlacesProviderError,
  type OpeningPeriod,
  type OpeningPoint,
  type PlaceCandidate,
  type PlacesProvider,
  type PlacesSearchParams,
} from "./types";

const SEARCH_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";

/**
 * Fields to request, and nothing else: the candidates table fields plus the
 * hours detail the meal-time check needs. No reviews, no photos.
 *
 * Billing SKU: Nearby Search Enterprise. priceLevel, rating and
 * currentOpeningHours are Enterprise fields; every other field here is Pro.
 * Billing uses the highest tier requested, so nothing above Enterprise
 * (the Atmosphere fields) may be added without a cost review.
 */
export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.utcOffsetMinutes",
  "places.priceLevel",
  "places.rating",
  "places.currentOpeningHours",
].join(",");

/** Nearby Search returns at most 20 places and has no next page. */
const MAX_RESULTS = 20;
const REQUEST_TIMEOUT_MS = 8_000;

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// The parts of Google's response this module reads. Zero values such as
// Sunday or minute 0 may be left out of the JSON, so every number is optional.
interface GooglePoint {
  day?: number;
  hour?: number;
  minute?: number;
}
interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryType?: string;
  utcOffsetMinutes?: number;
  priceLevel?: string;
  rating?: number;
  currentOpeningHours?: {
    openNow?: boolean;
    periods?: { open?: GooglePoint; close?: GooglePoint }[];
  };
}

function toPoint(p: GooglePoint): OpeningPoint {
  return { day: p.day ?? 0, hour: p.hour ?? 0, minute: p.minute ?? 0 };
}

function toPeriods(place: GooglePlace): OpeningPeriod[] {
  const periods: OpeningPeriod[] = [];
  for (const p of place.currentOpeningHours?.periods ?? []) {
    if (!p.open) continue;
    periods.push({ open: toPoint(p.open), close: p.close ? toPoint(p.close) : null });
  }
  return periods;
}

/** Map one Google place to the candidates shape. Returns null when a required field is missing. */
export function toCandidate(place: GooglePlace): PlaceCandidate | null {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const name = place.displayName?.text;
  if (!place.id || !name || lat === undefined || lng === undefined) return null;
  // Hotels and parking garages with a restaurant inside list "restaurant" too.
  if (!isFoodPlace(place.primaryType)) return null;
  // Delivery-only places have nowhere to sit down.
  if (isDeliveryOnly(place.primaryType)) return null;

  const types = place.types ?? [];
  return {
    place_id: place.id,
    name,
    address: place.formattedAddress ?? null,
    lat,
    lng,
    price_level: place.priceLevel ? (PRICE_LEVELS[place.priceLevel] ?? null) : null,
    cuisine_tags: cuisineTagsFromTypes(types),
    rating: place.rating ?? null,
    open_now: place.currentOpeningHours?.openNow ?? null,
    raw: {
      types,
      primary_type: place.primaryType ?? null,
      utc_offset_minutes: place.utcOffsetMinutes ?? 0,
      periods: toPeriods(place),
      dietary_confirmed: dietaryConfirmedFromTypes(types),
    },
  };
}

export function createGooglePlacesProvider(options: {
  apiKey: string;
  /** Injected in tests so no request leaves the machine. */
  fetchImpl?: typeof fetch;
}): PlacesProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async search(params: PlacesSearchParams): Promise<PlaceCandidate[]> {
      const { includedTypes, excludedTypes } = searchTypes(
        params.wantedCuisines,
        params.refusedCuisines,
      );

      // Everything the group wants is also refused, so there is nothing to ask for.
      if (includedTypes.length === 0) return [];

      let res: Response;
      try {
        res = await fetchImpl(SEARCH_NEARBY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": options.apiKey,
            "X-Goog-FieldMask": PLACES_FIELD_MASK,
          },
          body: JSON.stringify({
            includedTypes,
            ...(excludedTypes.length > 0 && { excludedTypes }),
            maxResultCount: MAX_RESULTS,
            // Popular places make a better shortlist than the 20 nearest.
            // Distance is sorted in code afterwards.
            rankPreference: "POPULARITY",
            languageCode: "en",
            locationRestriction: {
              circle: {
                center: { latitude: params.lat, longitude: params.lng },
                radius: params.radius_m,
              },
            },
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        // Timeouts and network errors. The message never includes the request.
        throw new PlacesProviderError("Could not reach the places service", null);
      }

      if (!res.ok) {
        throw new PlacesProviderError(
          `Places service returned ${res.status}`,
          res.status,
        );
      }

      const body = (await res.json()) as { places?: GooglePlace[] };
      return (body.places ?? [])
        .map(toCandidate)
        .filter((c): c is PlaceCandidate => c !== null);
    },
  };
}
