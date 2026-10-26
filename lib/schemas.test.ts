import { describe, expect, it } from "vitest";
import { createSessionSchema, joinSessionSchema } from "./schemas";

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

const valid = () => ({
  lat: 37.7749,
  lng: -122.4194,
  radius_m: 1500,
  meal_time: inOneHour(),
});

describe("createSessionSchema", () => {
  it("accepts a valid session", () => {
    expect(createSessionSchema.safeParse(valid()).success).toBe(true);
  });

  it.each([
    ["lat out of range", { lat: 91 }],
    ["lng out of range", { lng: -181 }],
    ["radius too small", { radius_m: 50 }],
    ["radius too large", { radius_m: 50_000 }],
    ["non-integer radius", { radius_m: 1500.5 }],
    ["meal time not a datetime", { meal_time: "tonight" }],
    [
      "meal time beyond 24h",
      { meal_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() },
    ],
    [
      "meal time well in the past",
      { meal_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    ],
  ])("rejects %s", (_label, override) => {
    expect(createSessionSchema.safeParse({ ...valid(), ...override }).success).toBe(
      false,
    );
  });

  it("rejects unknown fields", () => {
    expect(
      createSessionSchema.safeParse({ ...valid(), status: "closed" }).success,
    ).toBe(false);
  });
});

describe("joinSessionSchema", () => {
  it("trims the display name", () => {
    const r = joinSessionSchema.safeParse({ display_name: "  Sam  " });
    expect(r.success && r.data.display_name).toBe("Sam");
  });

  it("rejects empty and overlong names", () => {
    expect(joinSessionSchema.safeParse({ display_name: "   " }).success).toBe(false);
    expect(
      joinSessionSchema.safeParse({ display_name: "x".repeat(31) }).success,
    ).toBe(false);
  });
});
