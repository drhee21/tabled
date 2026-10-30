import { describe, expect, it } from "vitest";
import { groupBudget } from "./budget";

const range = (min: number | null, max: number | null) => ({ min, max });

describe("groupBudget", () => {
  it("returns null when nobody has answered", () => {
    expect(groupBudget([])).toBeNull();
  });

  it("covers every level when nobody set a budget", () => {
    expect(groupBudget([range(null, null), range(null, null)])).toEqual({
      min: 0,
      max: 4,
      unanimous: true,
      uncovered: [],
    });
  });

  it("is the intersection when ranges overlap", () => {
    expect(groupBudget([range(1, 3), range(2, 4)])).toEqual({
      min: 2,
      max: 3,
      unanimous: true,
      uncovered: [],
    });
  });

  it("treats a missing end as no limit", () => {
    expect(groupBudget([range(2, null), range(null, 2)])).toMatchObject({
      min: 2,
      max: 2,
      unanimous: true,
    });
  });

  it("serves the larger group when two ranges clash, and names who is left out", () => {
    // Levels 1: two people; 2: one; 3 and 4: one.
    const result = groupBudget([range(1, 1), range(1, 2), range(3, 4)]);
    expect(result).toEqual({ min: 1, max: 1, unanimous: false, uncovered: [2] });
  });

  it("searches every level when each one suits exactly one person", () => {
    // No level suits both, but each suits one, so no one is left out.
    expect(groupBudget([range(0, 2), range(3, 4)])).toEqual({
      min: 0,
      max: 4,
      unanimous: false,
      uncovered: [],
    });
  });

  it("picks the longest run of best-covered levels when there is a gap", () => {
    // Levels 0 to 1 and 3 to 4 are each covered once, with 2 uncovered. 0 to 2 is not a run.
    expect(groupBudget([range(0, 1), range(3, 3)])).toEqual({
      min: 0,
      max: 1,
      unanimous: false,
      uncovered: [1],
    });
  });

  it("prefers the cheaper run on a tie", () => {
    expect(groupBudget([range(0, 1), range(3, 4)])).toMatchObject({ min: 0, max: 1 });
  });

  it("does not report someone as left out if the range touches theirs", () => {
    // 1 to 2 is covered by two of three people; the third wants 2 to 4 and still overlaps at 2.
    const result = groupBudget([range(1, 2), range(1, 2), range(2, 4)]);
    expect(result).toMatchObject({ min: 2, max: 2, unanimous: true });
  });
});
