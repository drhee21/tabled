// Turns a failed request into something a person can read and act on.
// Client-safe: no server imports. The server's messages are kept where they are
// already specific (a validation problem, "Only the host can ..."); the vague
// statuses get a fixed title and a next step.
import type { ApiErrorResponse } from "./api-types";

export type FailureKind =
  | "not_found"
  | "expired"
  | "not_joined"
  | "not_allowed"
  | "wrong_state"
  | "too_few_places"
  | "places_down"
  | "rate_limited"
  | "invalid"
  | "server"
  | "network";

export interface Failure {
  kind: FailureKind;
  title: string;
  message: string;
  /** What to do next, when there is something to do. */
  hint?: string;
}

/** Where the request was made. A 422 from a search means "too few places"; elsewhere it is bad input. */
export type FailureContext = "general" | "search";

export const NETWORK_FAILURE: Failure = {
  kind: "network",
  title: "No connection",
  message: "We couldn’t reach Tabled.",
  hint: "Check your signal and try again.",
};

export function failureFromResponse(
  status: number,
  body: Partial<ApiErrorResponse> | null,
  context: FailureContext = "general",
): Failure {
  const serverMessage = body?.issues?.[0]?.message ?? body?.error;

  switch (status) {
    case 400:
      return {
        kind: "invalid",
        title: "Check your answers",
        message: serverMessage ?? "Something in that request wasn’t right.",
      };
    case 401:
      return {
        kind: "not_joined",
        title: "You haven’t joined this session",
        message: "This device isn’t signed in to the session.",
        hint: "If you cleared your cookies or switched browsers, ask the host for a new session.",
      };
    case 403:
      return {
        kind: "not_allowed",
        title: "Host only",
        message: serverMessage ?? "Only the host can do that.",
      };
    case 404:
      return {
        kind: "not_found",
        title: "Session not found",
        message: "We couldn’t find a session with that code.",
        hint: "Check the code, or ask the host to share the link again.",
      };
    case 409:
      return {
        kind: "wrong_state",
        title: "That’s not possible right now",
        message: serverMessage ?? "The session has moved on.",
        hint: "We’ve loaded the latest state.",
      };
    case 410:
      return {
        kind: "expired",
        title: "This session has expired",
        message: "Sessions last 24 hours.",
        hint: "Start a new session to keep going.",
      };
    case 422:
      if (context === "search") {
        return {
          kind: "too_few_places",
          title: "Not enough places",
          message: serverMessage ?? "Too few places matched everyone’s needs.",
          hint:
            "Ask people to loosen their budget or cuisines, then search again. " +
            "To widen the radius, start a new session.",
        };
      }
      return {
        kind: "invalid",
        title: "Check your answers",
        message: serverMessage ?? "Something in that request wasn’t right.",
      };
    case 429:
      // The rate limiter sends a wait time. Without one this is the per-session search cap.
      if (typeof body?.retry_after_s !== "number") {
        return {
          kind: "wrong_state",
          title: "No searches left",
          message: serverMessage ?? "This session has used all its searches.",
          hint: "Start a new session to search again.",
        };
      }
      return {
        kind: "rate_limited",
        title: "Slow down a little",
        message: serverMessage ?? "Please wait a little before trying again.",
      };
    case 502:
      return {
        kind: "places_down",
        title: "Couldn’t reach the places service",
        message: "The restaurant lookup failed, and this search wasn’t used.",
        hint: "Try again in a moment.",
      };
    default:
      return {
        kind: "server",
        title: "Something went wrong",
        message: "That didn’t work, and it’s not your fault.",
        hint: "Please try again.",
      };
  }
}

/** A problem found in the browser before anything was sent (a missing field, no location). */
export function inputProblem(title: string, message: string, hint?: string): Failure {
  return { kind: "invalid", title, message, hint };
}

/** True when the session's state may have changed under the person, so the page should reload. */
export function shouldReload(failure: Failure): boolean {
  return (
    failure.kind === "wrong_state" || failure.kind === "expired" || failure.kind === "not_found"
  );
}
