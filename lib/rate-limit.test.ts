import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./testing/fake-db";

vi.mock("@/lib/db", async () => {
  const { fakeDb } = await import("./testing/fake-db");
  return { getDb: () => fakeDb.db };
});

import { checkRateLimit, clientIp, hashIp, limitFor, windowStart } from "./rate-limit";

const NOON = new Date("2026-11-01T12:30:00Z");

function from(ip: string): Headers {
  return new Headers({ "x-forwarded-for": ip });
}

async function hitTimes(
  rule: Parameters<typeof checkRateLimit>[0],
  headers: Headers,
  times: number,
  now = NOON,
) {
  let last = await checkRateLimit(rule, headers, now);
  for (let i = 1; i < times; i++) last = await checkRateLimit(rule, headers, now);
  return last;
}

beforeEach(() => {
  fakeDb.reset();
  vi.unstubAllEnvs();
});

describe("per-IP limit", () => {
  it("allows up to the limit and blocks the next request", async () => {
    // Default: 5 new sessions per IP per hour.
    expect((await hitTimes("sessions_per_ip", from("1.2.3.4"), 5)).ok).toBe(true);
    const blocked = await checkRateLimit("sessions_per_ip", from("1.2.3.4"), NOON);
    expect(blocked.ok).toBe(false);
  });

  it("tells the caller how long to wait, up to the end of the window", async () => {
    await hitTimes("sessions_per_ip", from("1.2.3.4"), 5);
    const blocked = await checkRateLimit("sessions_per_ip", from("1.2.3.4"), NOON);
    if (blocked.ok) throw new Error("expected a block");
    // 12:30 -> the hourly window ends at 13:00.
    expect(blocked.retryAfterSeconds).toBe(30 * 60);
    expect(blocked.message).toContain("30 minutes");
    expect(blocked.global).toBe(false);
  });

  it("resets when the window rolls over", async () => {
    await hitTimes("sessions_per_ip", from("1.2.3.4"), 6);
    expect((await checkRateLimit("sessions_per_ip", from("1.2.3.4"), NOON)).ok).toBe(false);

    const nextHour = new Date("2026-11-01T13:00:00Z");
    expect((await checkRateLimit("sessions_per_ip", from("1.2.3.4"), nextHour)).ok).toBe(true);
  });

  it("counts each IP separately", async () => {
    await hitTimes("sessions_per_ip", from("1.2.3.4"), 6);
    expect((await checkRateLimit("sessions_per_ip", from("5.6.7.8"), NOON)).ok).toBe(true);
  });

  it("counts each rule separately", async () => {
    await hitTimes("sessions_per_ip", from("1.2.3.4"), 6);
    expect((await checkRateLimit("searches_per_ip", from("1.2.3.4"), NOON)).ok).toBe(true);
  });

  it("uses the env override for the limit", async () => {
    vi.stubEnv("RATE_SEARCHES_PER_HOUR", "2");
    expect(limitFor("searches_per_ip")).toBe(2);
    expect((await hitTimes("searches_per_ip", from("1.2.3.4"), 2)).ok).toBe(true);
    expect((await checkRateLimit("searches_per_ip", from("1.2.3.4"), NOON)).ok).toBe(false);
  });

  it("ignores a bad env value and uses the default", () => {
    vi.stubEnv("RATE_SEARCHES_PER_HOUR", "lots");
    expect(limitFor("searches_per_ip")).toBe(10);
    vi.stubEnv("RATE_SEARCHES_PER_HOUR", "0");
    expect(limitFor("searches_per_ip")).toBe(10);
  });

  it("stores a hash of the IP, never the address", async () => {
    await checkRateLimit("sessions_per_ip", from("203.0.113.9"), NOON);
    const stored = JSON.stringify(fakeDb.tables.rate_limits);
    expect(stored).not.toContain("203.0.113.9");
    expect(stored).toContain(hashIp("203.0.113.9"));
  });
});

describe("global daily cap", () => {
  it("blocks everyone once the day's total is used, then resets the next day", async () => {
    vi.stubEnv("RATE_SEARCHES_PER_DAY", "3");
    await checkRateLimit("searches_global", from("1.1.1.1"), NOON);
    await checkRateLimit("searches_global", from("2.2.2.2"), NOON);
    await checkRateLimit("searches_global", from("3.3.3.3"), NOON);

    const blocked = await checkRateLimit("searches_global", from("4.4.4.4"), NOON);
    if (blocked.ok) throw new Error("expected a block");
    expect(blocked.global).toBe(true);
    expect(blocked.message).toContain("daily search limit");

    const tomorrow = new Date("2026-11-02T00:00:00Z");
    expect((await checkRateLimit("searches_global", from("4.4.4.4"), tomorrow)).ok).toBe(true);
  });
});

describe("failure", () => {
  it("throws when the counter store fails, so paid calls are not let through", async () => {
    const broken = vi.spyOn(fakeDb.db, "rpc").mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "down" },
    } as never);
    await expect(checkRateLimit("searches_global", from("1.1.1.1"), NOON)).rejects.toThrow("down");
    broken.mockRestore();
  });
});

describe("client IP", () => {
  it("prefers the Vercel header, then x-real-ip, then the first forwarded entry", () => {
    expect(
      clientIp(new Headers({ "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" })),
    ).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }))).toBe(
      "2.2.2.2",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }))).toBe("3.3.3.3");
  });

  it("puts callers with no header into one shared bucket", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("IP hash", () => {
  it("changes with the salt and is stable for the same salt", () => {
    const a = hashIp("1.2.3.4", { RATE_LIMIT_SALT: "one" });
    const b = hashIp("1.2.3.4", { RATE_LIMIT_SALT: "two" });
    expect(a).not.toBe(b);
    expect(a).toBe(hashIp("1.2.3.4", { RATE_LIMIT_SALT: "one" }));
    expect(a).not.toContain("1.2.3.4");
  });

  it("refuses to run in production without a salt", () => {
    expect(() => hashIp("1.2.3.4", { NODE_ENV: "production" })).toThrow(
      "RATE_LIMIT_SALT",
    );
  });
});

describe("windowStart", () => {
  it("rounds down to the start of the hour and of the UTC day", () => {
    expect(windowStart(NOON, 60 * 60 * 1000).toISOString()).toBe("2026-11-01T12:00:00.000Z");
    expect(windowStart(NOON, 24 * 60 * 60 * 1000).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});
