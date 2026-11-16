import { describe, expect, it } from "vitest";
import { distanceLabel, milesToMeters } from "./format";

describe("milesToMeters", () => {
  it("converts to whole meters", () => {
    expect(milesToMeters(1)).toBe(1609);
    expect(milesToMeters(0.5)).toBe(805);
    expect(milesToMeters(10)).toBe(16_093);
  });
});

describe("distanceLabel", () => {
  it("shows miles to one decimal", () => {
    expect(distanceLabel(1609)).toBe("1.0 mi");
    expect(distanceLabel(2100)).toBe("1.3 mi");
    expect(distanceLabel(16_093)).toBe("10.0 mi");
  });

  it("shows feet under a tenth of a mile", () => {
    expect(distanceLabel(100)).toBe("330 ft");
    expect(distanceLabel(0)).toBe("0 ft");
  });
});
