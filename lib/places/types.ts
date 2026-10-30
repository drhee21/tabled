// Provider-neutral shapes. Nothing in here names a vendor, so the filters,
// the search orchestrator and the tests never depend on Google.
import type { CuisineValue, DietaryValue } from "../preference-options";

/** A time within the week, in the place's own timezone. day 0 is Sunday. */
export interface OpeningPoint {
  day: number;
  hour: number;
  minute: number;
}

/** close is null when the place is open all the time. */
export interface OpeningPeriod {
  open: OpeningPoint;
  close: OpeningPoint | null;
}

/** Provider detail kept in the candidates.raw column. Hours stay local to the place. */
export interface CandidateRaw {
  types: string[];
  primary_type: string | null;
  utc_offset_minutes: number;
  periods: OpeningPeriod[];
  /** Dietary needs the place's own data confirms. */
  dietary_confirmed: DietaryValue[];
}

/** The candidates table shape, as a provider returns it. */
export interface PlaceCandidate {
  place_id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  /** 0 (free) to 4 (very expensive). Null when the provider has no price. */
  price_level: number | null;
  cuisine_tags: CuisineValue[];
  rating: number | null;
  /** Whether the place is open right now. The meal-time check uses raw.periods. */
  open_now: boolean | null;
  raw: CandidateRaw;
}

/** A candidate after filtering: annotated with distance and dietary certainty. */
export interface ScoredCandidate extends PlaceCandidate {
  distance_m: number;
  dietary_unknown: boolean;
}

export interface PlacesSearchParams {
  lat: number;
  lng: number;
  radius_m: number;
  /** Used to steer the search; the filters do the real work. */
  wantedCuisines: CuisineValue[];
  refusedCuisines: CuisineValue[];
}

/** The only door to place data. A provider returns candidates or throws PlacesProviderError. */
export interface PlacesProvider {
  search(params: PlacesSearchParams): Promise<PlaceCandidate[]>;
}

export class PlacesProviderError extends Error {
  /** HTTP status from the provider, or null for network failures and timeouts. */
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "PlacesProviderError";
    this.status = status;
  }
}
