import { PRICE_LEVEL_MAX, PRICE_LEVEL_MIN } from "../preference-options";

/** One person's budget. A null end means no limit on that side. */
export interface BudgetRange {
  min: number | null;
  max: number | null;
}

export interface GroupBudget {
  min: number;
  max: number;
  /** True when one range suits everyone. */
  unanimous: boolean;
  /** Positions in the input array of people the range does not touch at all. */
  uncovered: number[];
}

const LEVELS = Array.from(
  { length: PRICE_LEVEL_MAX - PRICE_LEVEL_MIN + 1 },
  (_, i) => PRICE_LEVEL_MIN + i,
);

/**
 * The group's price range: the price levels that suit the most people.
 * When everyone's ranges overlap this is their intersection. When they do not,
 * it is the longest run of levels covered by the most people (lowest on a
 * tie), and anyone the run does not touch is reported in `uncovered`.
 * Returns null when nobody has a budget to apply.
 */
export function groupBudget(ranges: readonly BudgetRange[]): GroupBudget | null {
  if (ranges.length === 0) return null;

  const lo = (r: BudgetRange) => r.min ?? PRICE_LEVEL_MIN;
  const hi = (r: BudgetRange) => r.max ?? PRICE_LEVEL_MAX;

  // A reversed range suits nobody; the schema rejects these, this is a guard.
  const coverage = LEVELS.map(
    (level) => ranges.filter((r) => lo(r) <= level && level <= hi(r)).length,
  );
  const best = Math.max(...coverage);
  if (best === 0) return null;

  let bestRun = { start: 0, length: 0 };
  let runStart = -1;
  for (let i = 0; i <= LEVELS.length; i++) {
    const inRun = i < LEVELS.length && coverage[i] === best;
    if (inRun && runStart === -1) runStart = i;
    if (!inRun && runStart !== -1) {
      const length = i - runStart;
      if (length > bestRun.length) bestRun = { start: runStart, length };
      runStart = -1;
    }
  }

  const min = LEVELS[bestRun.start];
  const max = LEVELS[bestRun.start + bestRun.length - 1];
  const uncovered = ranges.flatMap((r, i) => (hi(r) < min || lo(r) > max ? [i] : []));

  return { min, max, unanimous: best === ranges.length, uncovered };
}
