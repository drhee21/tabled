import type { OpeningPeriod } from "./types";

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

const weekMinute = (p: { day: number; hour: number; minute: number }) =>
  p.day * MINUTES_PER_DAY + p.hour * 60 + p.minute;

/**
 * Whether a place is open at a given instant. Opening periods are in the
 * place's own timezone, so the meal time is shifted by the place's UTC offset
 * before comparing. No periods means closed or unknown; both count as closed.
 */
export function isOpenAt(
  periods: readonly OpeningPeriod[],
  utcOffsetMinutes: number,
  mealTime: Date,
): boolean {
  if (periods.length === 0) return false;

  const local = new Date(mealTime.getTime() + utcOffsetMinutes * 60_000);
  const t =
    local.getUTCDay() * MINUTES_PER_DAY + local.getUTCHours() * 60 + local.getUTCMinutes();

  for (const period of periods) {
    if (period.close === null) return true;

    const start = weekMinute(period.open);
    let end = weekMinute(period.close);
    // A period that ends "before" it starts runs past the end of the week.
    if (end <= start) end += MINUTES_PER_WEEK;

    if ((t >= start && t < end) || (t + MINUTES_PER_WEEK >= start && t + MINUTES_PER_WEEK < end)) {
      return true;
    }
  }
  return false;
}
