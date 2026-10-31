import { describe, expect, it } from "vitest";
import { checkCanClose, checkCanJoin, checkCanVote, isExpired } from "./sessions";

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

describe("checkCanJoin for the host", () => {
  it("lets the host join while voting, so they can vote", () => {
    expect(checkCanJoin({ status: "voting", expires_at: later }, now, { host: true })).toEqual({
      ok: true,
    });
  });

  it("does not let anyone else join while voting", () => {
    expect(checkCanJoin({ status: "voting", expires_at: later }, now)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(checkCanJoin({ status: "voting", expires_at: later }, now, { host: false })).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it.each(["searching", "closed"] as const)("does not let even the host join when %s", (status) => {
    expect(checkCanJoin({ status, expires_at: later }, now, { host: true })).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it("does not let the host join an expired voting session", () => {
    expect(checkCanJoin({ status: "voting", expires_at: earlier }, now, { host: true })).toMatchObject({
      ok: false,
      status: 410,
    });
  });
});

describe("checkCanVote", () => {
  it("allows voting only in the voting state", () => {
    expect(checkCanVote({ status: "voting", expires_at: later }, now)).toEqual({ ok: true });
  });

  it("rejects a vote after voting is closed", () => {
    expect(checkCanVote({ status: "closed", expires_at: later }, now)).toEqual({
      ok: false,
      status: 409,
      error: "Voting has closed",
    });
  });

  it.each(["collecting", "searching"] as const)("rejects a vote while %s", (status) => {
    expect(checkCanVote({ status, expires_at: later }, now)).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it("rejects an expired session with 410", () => {
    expect(checkCanVote({ status: "voting", expires_at: earlier }, now)).toMatchObject({
      ok: false,
      status: 410,
    });
  });
});

describe("checkCanClose", () => {
  it("allows closing only while voting", () => {
    expect(checkCanClose({ status: "voting", expires_at: later }, now)).toEqual({ ok: true });
  });

  it.each(["collecting", "searching", "closed"] as const)("rejects closing when %s", (status) => {
    expect(checkCanClose({ status, expires_at: later }, now)).toMatchObject({
      ok: false,
      status: 409,
    });
  });
});
