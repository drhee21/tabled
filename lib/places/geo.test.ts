import { describe, expect, it } from "vitest";
import { distanceMeters } from "./geo";
import { CENTER, northOfCenter } from "./test-fixtures";

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters(CENTER, CENTER)).toBe(0);
  });

  it("is about 111 km for one degree of latitude", () => {
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBe(111_195);
  });

  it("is the same in both directions", () => {
    const a = CENTER;
    const b = { lat: 37.8044, lng: -122.2712 };
    expect(distanceMeters(a, b)).toBe(distanceMeters(b, a));
  });

  it("measures a point placed 750 m away as 750 m, to the meter", () => {
    expect(Math.abs(distanceMeters(CENTER, northOfCenter(750)) - 750)).toBeLessThanOrEqual(1);
  });
});
