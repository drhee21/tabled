// Hardening checks through the real route handlers and the in-memory database:
// expired sessions are refused everywhere, the rate limits answer 429 on the
// routes that spend money, and deleting expired sessions removes every child row.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./fake-db";

const mocks = vi.hoisted(() => ({ providerCalls: 0 }));

vi.mock("@/lib/db", async () => {
  const { fakeDb } = await import("./fake-db");
  return { getDb: () => fakeDb.db };
});
// Reaching the provider or the model would mean a limit or an expiry check was skipped.
vi.mock("@/lib/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/places")>()),
  getPlacesProvider: () => {
    mocks.providerCalls += 1;
    throw new Error("provider must not be reached");
  },
}));
vi.mock("@/lib/llm", () => ({
  getLLMClient: () => {
    throw new Error("model must not be reached");
  },
}));

import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[code]/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { PUT as putPreferences } from "@/app/api/sessions/[code]/preferences/route";
import { POST as search } from "@/app/api/sessions/[code]/search/route";
import { POST as vote } from "@/app/api/sessions/[code]/vote/route";
import { POST as close } from "@/app/api/sessions/[code]/close/route";
import { checkRateLimit } from "@/lib/rate-limit";

type Handler = (request: NextRequest, ctx: never) => Promise<Response>;

const PREFS = {
  dietary: [],
  budget_min: null,
  budget_max: null,
  cuisines_want: [],
  cuisines_avoid: [],
  note: null,
};

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

async function create(ip = "9.9.9.9"): Promise<Response> {
  return createSession(
    new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({
        lat: 37.7749,
        lng: -122.4194,
        radius_m: 1500,
        meal_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    }),
  );
}

async function call(
  handler: Handler,
  code: string,
  method: string,
  sub: string,
  cookie: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const request = new NextRequest(`http://localhost/api/sessions/${code}${sub}`, {
    method,
    headers: { cookie, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await handler(request, { params: Promise.resolve({ code }) } as never);
  return { status: res.status, res, json: (await res.json()) as Record<string, unknown> };
}

/** A session with a host and one participant who has submitted. */
async function sessionWithPeople() {
  const created = await create();
  expect(created.status).toBe(201);
  const code = ((await created.json()) as { join_code: string }).join_code;
  const hostCookie = cookiesFrom(created);
  const joined = await call(joinSession, code, "POST", "/join", "", { display_name: "Ben" });
  expect(joined.status).toBe(201);
  const benCookie = cookiesFrom(joined.res);
  expect((await call(putPreferences, code, "PUT", "/preferences", benCookie, PREFS)).status).toBe(
    200,
  );
  return { code, hostCookie, benCookie };
}

function expire(code: string) {
  const row = fakeDb.tables.sessions.find((s) => s.join_code === code);
  if (!row) throw new Error("no such session");
  row.expires_at = new Date(Date.now() - 1000).toISOString();
}

beforeEach(() => {
  fakeDb.reset();
  mocks.providerCalls = 0;
});

describe("expired sessions", () => {
  it("are refused with 410 by every route, for people who had access", async () => {
    const { code, hostCookie, benCookie } = await sessionWithPeople();
    expire(code);

    const results = {
      read: await call(getSession, code, "GET", "", hostCookie),
      join: await call(joinSession, code, "POST", "/join", "", { display_name: "Late" }),
      preferences: await call(putPreferences, code, "PUT", "/preferences", benCookie, PREFS),
      search: await call(search, code, "POST", "/search", hostCookie),
      vote: await call(vote, code, "POST", "/vote", benCookie, { place_id: "x" }),
      close: await call(close, code, "POST", "/close", hostCookie),
    };

    for (const [name, r] of Object.entries(results)) {
      expect(r.status, name).toBe(410);
      expect(r.json.error, name).toBe("This session has expired");
    }
    expect(mocks.providerCalls).toBe(0);
  });

  it("stay refused whatever the stored status is", async () => {
    const { code, hostCookie, benCookie } = await sessionWithPeople();
    for (const status of ["collecting", "searching", "voting", "closed"]) {
      fakeDb.tables.sessions[0].status = status;
      expire(code);
      expect((await call(getSession, code, "GET", "", hostCookie)).status).toBe(410);
      expect((await call(vote, code, "POST", "/vote", benCookie, { place_id: "x" })).status).toBe(
        410,
      );
    }
  });

  it("do not need the cleanup job: a live session is still served", async () => {
    const { code, hostCookie } = await sessionWithPeople();
    expect((await call(getSession, code, "GET", "", hostCookie)).status).toBe(200);
  });
});

describe("rate limits on the routes", () => {
  it("block the sixth new session from one IP with 429 and a Retry-After", async () => {
    for (let i = 0; i < 5; i++) expect((await create("7.7.7.7")).status).toBe(201);
    const blocked = await create("7.7.7.7");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = (await blocked.json()) as { error: string; retry_after_s: number };
    expect(body.error).toContain("Too many requests");
    expect(body.retry_after_s).toBeGreaterThan(0);

    // Another network is unaffected, and the blocked request created nothing.
    expect(fakeDb.tables.sessions).toHaveLength(5);
    expect((await create("8.8.8.8")).status).toBe(201);
  });

  it("block a search over the per-IP limit before any paid call", async () => {
    const { code, hostCookie } = await sessionWithPeople();
    const headers = { "x-forwarded-for": "6.6.6.6" };
    for (let i = 0; i < 10; i++) {
      await checkRateLimit("searches_per_ip", new Headers(headers));
    }
    const r = await call(search, code, "POST", "/search", hostCookie, undefined, headers);
    expect(r.status).toBe(429);
    expect(mocks.providerCalls).toBe(0);
    // Nothing was claimed: the session can still search later.
    expect(fakeDb.tables.sessions[0].status).toBe("collecting");
    expect(fakeDb.tables.sessions[0].search_count).toBe(0);
  });

  it("block every search once the app-wide daily cap is used", async () => {
    const { code, hostCookie } = await sessionWithPeople();
    for (let i = 0; i < 100; i++) {
      await checkRateLimit("searches_global", new Headers({ "x-forwarded-for": `10.0.0.${i}` }));
    }
    const r = await call(search, code, "POST", "/search", hostCookie, undefined, {
      "x-forwarded-for": "5.5.5.5",
    });
    expect(r.status).toBe(429);
    expect(String(r.json.error)).toContain("daily search limit");
    expect(mocks.providerCalls).toBe(0);
  });

  it("do not count a search from someone who is not the host", async () => {
    const { code, benCookie } = await sessionWithPeople();
    const before = fakeDb.tables.rate_limits.length;
    const r = await call(search, code, "POST", "/search", benCookie);
    expect(r.status).toBe(403);
    expect(fakeDb.tables.rate_limits).toHaveLength(before);
  });
});

describe("cleanup of expired sessions", () => {
  async function fillSession(code: string) {
    const session = fakeDb.tables.sessions.find((s) => s.join_code === code)!;
    const db = fakeDb.db;
    await db.from("candidates").insert({
      session_id: session.id,
      place_id: `p-${code}`,
      name: "Place",
      lat: 0,
      lng: 0,
    });
    await db.from("recommendations").insert({
      session_id: session.id,
      place_id: `p-${code}`,
      rank: 1,
      reason: null,
    });
    const ben = fakeDb.tables.participants.find((p) => p.session_id === session.id)!;
    await db.from("votes").insert({
      session_id: session.id,
      participant_id: ben.id,
      place_id: `p-${code}`,
    });
  }

  it("removes the session and every child row, and leaves live sessions alone", async () => {
    const old = await sessionWithPeople();
    const live = await sessionWithPeople();
    await fillSession(old.code);
    await fillSession(live.code);
    expire(old.code);

    // The same statement cleanup_expired() runs in Postgres.
    const { error } = await fakeDb.db
      .from("sessions")
      .delete()
      .lte("expires_at", new Date().toISOString());
    expect(error).toBeNull();

    const liveId = fakeDb.tables.sessions.find((s) => s.join_code === live.code)!.id;
    expect(fakeDb.tables.sessions.map((s) => s.join_code)).toEqual([live.code]);
    for (const table of ["participants", "candidates", "recommendations", "votes"]) {
      const rows = fakeDb.tables[table];
      expect(rows.length, table).toBe(1);
      expect(rows[0].session_id, table).toBe(liveId);
    }
    // Preferences belong to participants, one level further down.
    const participantIds = new Set(fakeDb.tables.participants.map((p) => p.id));
    expect(fakeDb.tables.preferences).toHaveLength(1);
    expect(participantIds.has(fakeDb.tables.preferences[0].participant_id as string)).toBe(true);
  });
});
