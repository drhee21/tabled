import { describe, expect, it } from "vitest";
import { failureFromResponse, inputProblem, NETWORK_FAILURE, shouldReload } from "./failure";

describe("failureFromResponse", () => {
  it("explains a missing or expired session and says what to do", () => {
    const missing = failureFromResponse(404, { error: "Session not found" });
    expect(missing.kind).toBe("not_found");
    expect(missing.hint).toContain("code");

    const expired = failureFromResponse(410, { error: "This session has expired" });
    expect(expired.kind).toBe("expired");
    expect(expired.hint).toContain("new session");
  });

  it("explains a missing token without blaming the person", () => {
    const f = failureFromResponse(401, { error: "Join this session first" });
    expect(f.kind).toBe("not_joined");
    expect(f.hint).toContain("cookies");
  });

  it("keeps the server's message when a non-host tries a host action", () => {
    const f = failureFromResponse(403, { error: "Only the host can close voting" });
    expect(f.kind).toBe("not_allowed");
    expect(f.message).toBe("Only the host can close voting");
  });

  it("treats a state conflict as a reason to reload", () => {
    const f = failureFromResponse(409, { error: "Voting has closed" });
    expect(f.kind).toBe("wrong_state");
    expect(f.message).toBe("Voting has closed");
    expect(shouldReload(f)).toBe(true);
    expect(shouldReload(failureFromResponse(400, { error: "bad" }))).toBe(false);
  });

  it("suggests ways to get more places when a search finds too few", () => {
    const f = failureFromResponse(
      422,
      { error: "Only 2 places matched everyone's needs. Try widening the radius." },
      "search",
    );
    expect(f.kind).toBe("too_few_places");
    expect(f.hint).toContain("budget");
    expect(f.hint).toContain("radius");
    expect(f.message).toContain("Only 2 places");
  });

  it("reads a 422 outside a search as bad input", () => {
    expect(failureFromResponse(422, { error: "Nope" }).kind).toBe("invalid");
  });

  it("uses the first validation issue for a 400", () => {
    const f = failureFromResponse(400, {
      error: "Invalid request",
      issues: [{ path: "display_name", message: "Enter a name" }],
    });
    expect(f.message).toBe("Enter a name");
  });

  it("tells a rate limit from the per-session search cap", () => {
    const limited = failureFromResponse(429, {
      error: "Too many requests from your network. You can run searches again in 30 minutes.",
      retry_after_s: 1800,
    });
    expect(limited.kind).toBe("rate_limited");
    expect(limited.message).toContain("30 minutes");

    const cap = failureFromResponse(429, { error: "This session has used all 3 searches" });
    expect(cap.kind).toBe("wrong_state");
    expect(cap.title).toBe("No searches left");
  });

  it("says a failed places lookup did not use up the search", () => {
    const f = failureFromResponse(502, { error: "Could not reach the places service." });
    expect(f.kind).toBe("places_down");
    expect(f.message).toContain("wasn’t used");
  });

  it("falls back to a calm generic message for server errors", () => {
    const f = failureFromResponse(500, { error: "Something went wrong. Please try again." });
    expect(f.kind).toBe("server");
    expect(f.hint).toBe("Please try again.");
  });

  it("has a message for no connection and for local input problems", () => {
    expect(NETWORK_FAILURE.kind).toBe("network");
    expect(inputProblem("Set a location first", "Tap the button.").kind).toBe("invalid");
  });
});
