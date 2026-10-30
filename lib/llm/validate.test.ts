import { describe, expect, it } from "vitest";
import { answer, VALID_ANSWER } from "./test-fixtures";
import { MAX_REASON_LENGTH, SHORTLIST_SIZE, validateRanking } from "./validate";

const IDS = ["a", "b", "c", "d", "e", "f"];

function pick(place_id: string, rank: number, reason = "Fits the group.") {
  return { place_id, rank, reason };
}

function issuesOf(raw: string): string[] {
  const result = validateRanking(raw, IDS);
  if (result.ok) throw new Error("expected the answer to be rejected");
  return result.issues;
}

describe("validateRanking", () => {
  it("accepts a valid answer", () => {
    const result = validateRanking(VALID_ANSWER, IDS);
    expect(result).toEqual({
      ok: true,
      picks: [
        { place_id: "a", rank: 1, reason: "2 of 3 want Thai and it is the nearest." },
        { place_id: "b", rank: 2, reason: "Matches Ben’s pizza request." },
        { place_id: "c", rank: 3, reason: "Fits the group’s budget." },
      ],
    });
  });

  it("accepts exactly three picks", () => {
    const picks = IDS.slice(0, SHORTLIST_SIZE).map((id, i) => pick(id, i + 1));
    expect(SHORTLIST_SIZE).toBe(3);
    expect(validateRanking(answer(picks), IDS).ok).toBe(true);
  });

  it("sorts by rank, renumbers from 1 and trims reasons", () => {
    const result = validateRanking(
      answer([pick("c", 5, "  Third.  "), pick("a", 2), pick("b", 4)]),
      IDS,
    );
    expect(result).toMatchObject({
      ok: true,
      picks: [
        { place_id: "a", rank: 1 },
        { place_id: "b", rank: 2 },
        { place_id: "c", rank: 3, reason: "Third." },
      ],
    });
  });

  it("accepts a reason of exactly the length cap", () => {
    const reason = "x".repeat(MAX_REASON_LENGTH);
    expect(
      validateRanking(answer([pick("a", 1, reason), pick("b", 2), pick("c", 3)]), IDS).ok,
    ).toBe(true);
  });

  it("rejects an invented place_id", () => {
    expect(
      issuesOf(answer([pick("a", 1), pick("b", 2), pick("not-a-candidate", 3)])),
    ).toEqual(["unknown_place_id"]);
  });

  it("rejects a duplicate place_id", () => {
    expect(issuesOf(answer([pick("a", 1), pick("a", 2), pick("b", 3)]))).toContain(
      "duplicate_place_id",
    );
  });

  it("rejects a duplicate rank", () => {
    expect(issuesOf(answer([pick("a", 1), pick("b", 1), pick("c", 2)]))).toEqual([
      "duplicate_rank",
    ]);
  });

  it("rejects fewer than three picks", () => {
    expect(issuesOf(answer([pick("a", 1), pick("b", 2)]))).toEqual(["too_few_picks"]);
    expect(issuesOf(answer([]))).toEqual(["too_few_picks"]);
  });

  it("rejects more than three picks", () => {
    for (const n of [4, 5, 6]) {
      const picks = IDS.slice(0, n).map((id, i) => pick(id, i + 1));
      expect(issuesOf(JSON.stringify({ picks })), `${n} picks`).toEqual(["too_many_picks"]);
    }
  });

  it("rejects a reason over the length cap", () => {
    const reason = "x".repeat(MAX_REASON_LENGTH + 1);
    expect(issuesOf(answer([pick("a", 1, reason), pick("b", 2), pick("c", 3)]))).toEqual([
      "reason_too_long",
    ]);
  });

  it("rejects an empty or blank reason", () => {
    expect(issuesOf(answer([pick("a", 1, ""), pick("b", 2), pick("c", 3)]))).toEqual([
      "empty_reason",
    ]);
    expect(issuesOf(answer([pick("a", 1, "   "), pick("b", 2), pick("c", 3)]))).toEqual([
      "empty_reason",
    ]);
  });

  it("rejects malformed JSON", () => {
    expect(issuesOf("not json at all")).toEqual(["not_json"]);
    expect(issuesOf('{"picks": [')).toEqual(["not_json"]);
    expect(issuesOf("")).toEqual(["not_json"]);
  });

  it("rejects JSON in the wrong shape", () => {
    for (const raw of [
      "[]",
      "null",
      '{"picks": "a"}',
      '{"results": []}',
      JSON.stringify({ picks: [{ place_id: "a", rank: "1", reason: "x" }] }),
      JSON.stringify({ picks: [{ place_id: "a", rank: 1.5, reason: "x" }] }),
      JSON.stringify({ picks: [{ place_id: "a", rank: 0, reason: "x" }] }),
      JSON.stringify({ picks: [{ place_id: "a", rank: 1 }] }),
      JSON.stringify({ picks: [{ rank: 1, reason: "x" }] }),
    ]) {
      expect(issuesOf(raw), raw).toEqual(["wrong_shape"]);
    }
  });

  it("reports every problem at once", () => {
    expect(
      issuesOf(answer([pick("a", 1), pick("a", 1, ""), pick("zzz", 3, "x".repeat(200))])),
    ).toEqual(
      expect.arrayContaining([
        "unknown_place_id",
        "duplicate_place_id",
        "duplicate_rank",
        "empty_reason",
        "reason_too_long",
      ]),
    );
  });

  it("never quotes the model's output in its issues", () => {
    const issues = issuesOf(answer([pick("secret-invented-id", 1, "SECRET"), pick("a", 2), pick("b", 3)]));
    expect(JSON.stringify(issues)).not.toMatch(/secret|SECRET/);
  });
});
