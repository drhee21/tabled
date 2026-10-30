import { describe, expect, it } from "vitest";
import { isOpenAt } from "./hours";
import { MEAL_TIME, PDT_OFFSET_MINUTES } from "./test-fixtures";
import type { OpeningPeriod } from "./types";

const FRIDAY = 5;
const SATURDAY = 6;
const SUNDAY = 0;

const period = (
  day: number,
  fromHour: number,
  toDay: number,
  toHour: number,
): OpeningPeriod => ({
  open: { day, hour: fromHour, minute: 0 },
  close: { day: toDay, hour: toHour, minute: 0 },
});

describe("isOpenAt", () => {
  // MEAL_TIME is Friday 12:00 in San Francisco.
  it("is open inside a period", () => {
    expect(isOpenAt([period(FRIDAY, 11, FRIDAY, 14)], PDT_OFFSET_MINUTES, MEAL_TIME)).toBe(true);
  });

  it("is closed outside every period", () => {
    expect(isOpenAt([period(FRIDAY, 17, FRIDAY, 22)], PDT_OFFSET_MINUTES, MEAL_TIME)).toBe(false);
  });

  it("is closed when the only period is on another day", () => {
    expect(isOpenAt([period(SATURDAY, 11, SATURDAY, 14)], PDT_OFFSET_MINUTES, MEAL_TIME)).toBe(false);
  });

  it("includes the opening minute and excludes the closing minute", () => {
    const hours = [period(FRIDAY, 12, FRIDAY, 13)];
    expect(isOpenAt(hours, PDT_OFFSET_MINUTES, MEAL_TIME)).toBe(true);
    const oneHourLater = new Date(MEAL_TIME.getTime() + 60 * 60_000);
    expect(isOpenAt(hours, PDT_OFFSET_MINUTES, oneHourLater)).toBe(false);
  });

  it("reads hours in the place's timezone, not the server's", () => {
    const hours = [period(FRIDAY, 11, FRIDAY, 14)];
    expect(isOpenAt(hours, PDT_OFFSET_MINUTES, MEAL_TIME)).toBe(true);
    // The same instant is 19:00 in UTC, when this place is closed.
    expect(isOpenAt(hours, 0, MEAL_TIME)).toBe(false);
  });

  it("handles a period that runs past midnight", () => {
    const hours = [period(FRIDAY, 18, SATURDAY, 2)];
    const saturday1amLocal = new Date("2026-10-31T08:00:00Z");
    expect(isOpenAt(hours, PDT_OFFSET_MINUTES, saturday1amLocal)).toBe(true);
    const saturday3amLocal = new Date("2026-10-31T10:00:00Z");
    expect(isOpenAt(hours, PDT_OFFSET_MINUTES, saturday3amLocal)).toBe(false);
  });

  it("handles a period that runs from Saturday into Sunday", () => {
    const hours = [period(SATURDAY, 20, SUNDAY, 3)];
    const sunday1amUtc = new Date("2026-11-01T01:00:00Z");
    expect(isOpenAt(hours, 0, sunday1amUtc)).toBe(true);
  });

  it("is always open when the period has no close", () => {
    const hours: OpeningPeriod[] = [{ open: { day: 0, hour: 0, minute: 0 }, close: null }];
    expect(isOpenAt(hours, PDT_OFFSET_MINUTES, MEAL_TIME)).toBe(true);
  });

  it("counts a place with no hours as closed", () => {
    expect(isOpenAt([], PDT_OFFSET_MINUTES, MEAL_TIME)).toBe(false);
  });
});
