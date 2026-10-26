// Response shapes shared by route handlers and client components.
// Keep this file free of server imports so the browser can use it.
import type { SessionStatus } from "./schemas";

export interface SessionStateResponse {
  join_code: string;
  status: SessionStatus;
  radius_m: number;
  meal_time: string;
  expires_at: string;
  participants: { id: string; display_name: string; joined_at: string }[];
  viewer: { is_host: boolean; participant_id: string | null };
}

export interface ApiErrorResponse {
  error: string;
  issues?: { path: string; message: string }[];
}
