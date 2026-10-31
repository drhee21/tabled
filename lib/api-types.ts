// Response shapes shared by route handlers and client components.
// Keep this file free of server imports so the browser can use it.
import type { CuisineValue, DietaryValue } from "./preference-options";
import type { SessionStatus } from "./schemas";

/** A participant's own saved answers, returned only to that participant. */
export interface OwnPreferences {
  dietary: DietaryValue[];
  budget_min: number | null;
  budget_max: number | null;
  cuisines_want: CuisineValue[];
  cuisines_avoid: CuisineValue[];
  note: string | null;
}

/** A place the search kept. Hours and provider detail stay on the server. */
export interface CandidateSummary {
  place_id: string;
  name: string;
  address: string | null;
  /** 0 (free) to 4 (very expensive), or null when unknown. */
  price_level: number | null;
  cuisine_tags: string[];
  rating: number | null;
  open_now: boolean | null;
  /** The group has dietary needs this place's data cannot confirm. */
  dietary_unknown: boolean;
  distance_m: number;
}

/** The price range a search used, and who it left out when budgets clash. */
export interface BudgetSummary {
  min: number;
  max: number;
  unanimous: boolean;
  left_out: string[];
}

/** A shortlisted place. `reason` is null when code ranked the shortlist. */
export interface RecommendationSummary extends CandidateSummary {
  rank: number;
  reason: string | null;
}

export interface Shortlist {
  /** "llm" when the model wrote the reasons; "code" when the fallback ranking was used. */
  ranked_by: "llm" | "code";
  picks: RecommendationSummary[];
}

/** Vote totals. Counts only: nobody can see who voted for what. */
export interface VoteCounts {
  /** Votes per shortlisted place, including zeros. */
  counts: Record<string, number>;
  /** People who have voted. */
  voted: number;
  /** People who joined and can vote. */
  total: number;
}

export interface VoteState extends VoteCounts {
  /** The viewer's own vote, or null if they have not voted. */
  my_vote: string | null;
}

export interface SearchResponse {
  candidates: CandidateSummary[];
  budget: BudgetSummary | null;
  shortlist: Shortlist;
  searches_used: number;
}

export interface SessionStateResponse {
  join_code: string;
  status: SessionStatus;
  radius_m: number;
  meal_time: string;
  expires_at: string;
  /** `submitted` is present only when the viewer is the host. */
  participants: {
    id: string;
    display_name: string;
    joined_at: string;
    submitted?: boolean;
  }[];
  viewer: {
    is_host: boolean;
    participant_id: string | null;
    /** The viewer's own answers, or null if they have not submitted. */
    preferences: OwnPreferences | null;
    /** Broadcast channel for live submission events. Host only. */
    realtime_topic: string | null;
    /** Broadcast channel for live vote counts. Only people who joined get it. */
    votes_topic: string | null;
  };
  /** The ranked places everyone votes on. Present once a search has finished, for people who joined. */
  shortlist?: Shortlist;
  /** Vote totals and the viewer's own vote, once voting has started. For people who joined. */
  votes?: VoteState;
  /** Set once the host has closed voting. */
  winner_place_id?: string | null;
  /** Host only: searches run so far, and the places the last one kept. */
  host?: { searches_used: number; candidates: CandidateSummary[] };
}

export interface ApiErrorResponse {
  error: string;
  issues?: { path: string; message: string }[];
}
