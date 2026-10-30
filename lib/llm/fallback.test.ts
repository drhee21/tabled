import { describe, expect, it } from "vitest";
import { fallbackRanking } from "./fallback";
import { fiveCandidates, makeCandidate, makeParticipant } from "./test-fixtures";

describe("fallbackRanking", () => {
  it("ranks more wanted-cuisine matches first, then distance, then rating", () => {
    const candidates = [
      makeCandidate({ place_id: "far-thai", cuisine_tags: ["thai"], meters: 900 }),
      makeCandidate({ place_id: "near-none", cuisine_tags: [], meters: 100 }),
      makeCandidate({ place_id: "near-thai", cuisine_tags: ["thai"], meters: 300 }),
      makeCandidate({ place_id: "pizza", cuisine_tags: ["pizza"], meters: 200 }),
      makeCandidate({ place_id: "near-thai-better", cuisine_tags: ["thai"], meters: 300, rating: 4.9 }),
    ];
    const people = [
      makeParticipant({ cuisines_want: ["thai"] }),
      makeParticipant({ cuisines_want: ["thai", "pizza"] }),
      makeParticipant({ cuisines_want: ["pizza"] }),
    ];

    // Thai: 2 people, pizza: 2 people, none: 0. Tie broken by distance, then rating.
    expect(fallbackRanking(candidates, people).map((p) => p.place_id)).toEqual([
      "pizza",
      "near-thai-better",
      "near-thai",
      "far-thai",
      "near-none",
    ]);
  });

  it("puts unrated places after rated ones at equal distance", () => {
    const candidates = [
      makeCandidate({ place_id: "unrated", rating: null, meters: 100 }),
      makeCandidate({ place_id: "rated", rating: 3.0, meters: 100 }),
    ];
    const ids = fallbackRanking(candidates, []).map((p) => p.place_id);
    expect(ids).toEqual(["rated", "unrated"]);
  });

  it("returns at most five picks, numbered from 1, with no reasons", () => {
    const many = [...fiveCandidates(), makeCandidate({ place_id: "f" }), makeCandidate({ place_id: "g" })];
    const picks = fallbackRanking(many, []);
    expect(picks).toHaveLength(5);
    expect(picks.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(picks.every((p) => p.reason === null)).toBe(true);
  });

  it("only returns places from the input and does not depend on input order", () => {
    const candidates = fiveCandidates();
    const forward = fallbackRanking(candidates, []).map((p) => p.place_id);
    const reversed = fallbackRanking([...candidates].reverse(), []).map((p) => p.place_id);
    expect(reversed).toEqual(forward);
    expect(forward.every((id) => candidates.some((c) => c.place_id === id))).toBe(true);
  });
});
