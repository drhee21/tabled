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
  };
}

export interface ApiErrorResponse {
  error: string;
  issues?: { path: string; message: string }[];
}
