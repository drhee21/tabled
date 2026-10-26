import { describe, expect, it } from "vitest";
import { checkCanJoin, isExpired } from "./sessions";

const now = new Date("2026-10-24T18:00:00Z");
const later = "2026-10-25T18:00:00Z";
const earlier = "2026-10-24T17:00:00Z";

describe("checkCanJoin", () => {
  it("allows joining a collecting session that has not expired", () => {
    expect(checkCanJoin({ status: "collecting", expires_at: later }, now)).toEqual({
      ok: true,
    });
  });

  it.each(["searching", "voting", "closed"] as const)(
    "rejects joining when status is %s",
    (status) => {
      const r = checkCanJoin({ status, expires_at: later }, now);
      expect(r).toMatchObject({ ok: false, status: 409 });
    },
  );

  it("rejects an expired session with 410, even while collecting", () => {
    const r = checkCanJoin({ status: "collecting", expires_at: earlier }, now);
    expect(r).toMatchObject({ ok: false, status: 410 });
  });
});

describe("isExpired", () => {
  it("treats the exact expiry instant as expired", () => {
    expect(isExpired({ expires_at: now.toISOString() }, now)).toBe(true);
  });
});
