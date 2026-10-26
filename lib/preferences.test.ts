import { describe, expect, it } from "vitest";
import { hostRealtimeTopic } from "./realtime";
import { preferencesSchema } from "./schemas";
import { checkCanSubmitPreferences } from "./sessions";

const valid = () => ({
  dietary: ["vegetarian"],
  budget_min: 1,
  budget_max: 3,
  cuisines_want: ["italian", "thai"],
  cuisines_avoid: ["seafood"],
  note: "Prefer somewhere with outdoor seating",
});

describe("preferencesSchema", () => {
  it("accepts valid answers", () => {
    expect(preferencesSchema.safeParse(valid()).success).toBe(true);
  });

  it("accepts empty lists, no budget and no note", () => {
    const r = preferencesSchema.safeParse({
      dietary: [],
      budget_min: null,
      budget_max: null,
      cuisines_want: [],
      cuisines_avoid: [],
    });
    expect(r.success && r.data.note).toBeNull();
  });

  it("trims the note and turns a blank one into null", () => {
    const r = preferencesSchema.safeParse({ ...valid(), note: "   " });
    expect(r.success && r.data.note).toBeNull();
  });

  it("removes duplicate entries", () => {
    const r = preferencesSchema.safeParse({
      ...valid(),
      dietary: ["vegan", "vegan"],
    });
    expect(r.success && r.data.dietary).toEqual(["vegan"]);
  });

  it.each([
    ["unknown dietary value", { dietary: ["paleo"] }],
    ["unknown cuisine", { cuisines_want: ["klingon"] }],
    ["budget below range", { budget_min: -1 }],
    ["budget above range", { budget_max: 5 }],
    ["non-integer budget", { budget_min: 1.5 }],
    ["min above max", { budget_min: 3, budget_max: 1 }],
    ["note over 280 characters", { note: "x".repeat(281) }],
    ["cuisine both wanted and refused", { cuisines_want: ["thai"], cuisines_avoid: ["thai"] }],
  ])("rejects %s", (_label, override) => {
    expect(preferencesSchema.safeParse({ ...valid(), ...override }).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      preferencesSchema.safeParse({ ...valid(), participant_id: "someone-else" }).success,
    ).toBe(false);
  });
});

describe("checkCanSubmitPreferences", () => {
  const now = new Date("2026-10-24T18:00:00Z");
  const later = "2026-10-25T18:00:00Z";

  it("allows submitting while collecting", () => {
    expect(
      checkCanSubmitPreferences({ status: "collecting", expires_at: later }, now),
    ).toEqual({ ok: true });
  });

  it.each(["searching", "voting", "closed"] as const)(
    "rejects submitting when status is %s",
    (status) => {
      expect(
        checkCanSubmitPreferences({ status, expires_at: later }, now),
      ).toMatchObject({ ok: false, status: 409 });
    },
  );

  it("rejects an expired session with 410", () => {
    expect(
      checkCanSubmitPreferences(
        { status: "collecting", expires_at: "2026-10-24T17:00:00Z" },
        now,
      ),
    ).toMatchObject({ ok: false, status: 410 });
  });
});

describe("hostRealtimeTopic", () => {
  it("is stable per host and differs between hosts", () => {
    expect(hostRealtimeTopic("hash-a")).toBe(hostRealtimeTopic("hash-a"));
    expect(hostRealtimeTopic("hash-a")).not.toBe(hostRealtimeTopic("hash-b"));
  });

  it("does not contain the stored hash", () => {
    expect(hostRealtimeTopic("hash-a")).not.toContain("hash-a");
  });
});
