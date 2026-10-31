// One end-to-end run of the whole flow through the real route handlers:
// create, join, preferences, search, vote, close, result. The database is an
// in-memory fake and the Places and LLM clients are mocked, so it runs offline
// and costs nothing.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scriptedLLM, answer } from "../llm/test-fixtures";
import { mockProvider, makePlace } from "../places/test-fixtures";
import { fakeDb } from "./fake-db";

const mocks = vi.hoisted(() => ({
  provider: null as unknown,
  llm: null as unknown,
}));

vi.mock("@/lib/db", async () => {
  const { fakeDb } = await import("./fake-db");
  return { getDb: () => fakeDb.db };
});
vi.mock("@/lib/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/places")>()),
  getPlacesProvider: () => mocks.provider,
}));
vi.mock("@/lib/llm", () => ({ getLLMClient: () => mocks.llm }));

import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[code]/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { PUT as putPreferences } from "@/app/api/sessions/[code]/preferences/route";
import { POST as search } from "@/app/api/sessions/[code]/search/route";
import { POST as vote } from "@/app/api/sessions/[code]/vote/route";
import { POST as close } from "@/app/api/sessions/[code]/close/route";
import { castVote } from "@/lib/votes";

// ---- helpers ---------------------------------------------------------------

/** One browser's cookies. */
class Jar {
  private cookies = new Map<string, string>();
  absorb(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const [name, ...value] = pair.split("=");
      this.cookies.set(name, value.join("="));
    }
  }
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

type Handler = (request: NextRequest, ctx: never) => Promise<Response>;

async function call(
  handler: Handler,
  jar: Jar,
  code: string,
  method: string,
  sub: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const request = new NextRequest(`http://localhost/api/sessions/${code}${sub}`, {
    method,
    headers: { cookie: jar.header(), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await handler(request, { params: Promise.resolve({ code }) } as never);
  jar.absorb(res);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const PREFS = {
  dietary: [],
  budget_min: 1,
  budget_max: 3,
  cuisines_want: ["thai", "pizza"],
  cuisines_avoid: [],
  note: null,
};

/** Four open places near the session, tagged Thai or pizza. Always open, so any meal time works. */
function places() {
  const alwaysOpen = { periods: [{ open: { day: 0, hour: 0, minute: 0 }, close: null }] };
  return [
    makePlace({ place_id: "pizza-1", name: "Pizza One", cuisine_tags: ["pizza"], meters: 100, raw: alwaysOpen }),
    makePlace({ place_id: "thai-1", name: "Thai One", cuisine_tags: ["thai"], meters: 200, raw: alwaysOpen }),
    makePlace({ place_id: "thai-2", name: "Thai Two", cuisine_tags: ["thai"], meters: 300, raw: alwaysOpen }),
    makePlace({ place_id: "pizza-2", name: "Pizza Two", cuisine_tags: ["pizza"], meters: 400, raw: alwaysOpen }),
  ];
}

// The model's ranking: pizza-1 first, then the two Thai places.
const LLM_ANSWER = answer([
  { place_id: "pizza-1", rank: 1, reason: "Matches the pizza request and is the nearest." },
  { place_id: "thai-1", rank: 2, reason: "Two people want Thai." },
  { place_id: "thai-2", rank: 3, reason: "A second Thai option within budget." },
]);

interface Group {
  code: string;
  host: Jar;
  ben: Jar;
  hostId: string | null;
  benId: string;
}

/** Create a session and run it up to the search. The host joins only if asked. */
async function startSession(options: { hostJoins: boolean }): Promise<Group> {
  const host = new Jar();
  const ben = new Jar();

  const created = await createSession(
    new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lat: 37.7749,
        lng: -122.4194,
        radius_m: 1500,
        meal_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    }),
  );
  host.absorb(created);
  expect(created.status).toBe(201);
  const code = ((await created.json()) as { join_code: string }).join_code;

  let hostId: string | null = null;
  if (options.hostJoins) {
    const joined = await call(joinSession, host, code, "POST", "/join", { display_name: "Hannah" });
    expect(joined.status).toBe(201);
    hostId = joined.json.participant_id as string;
    const saved = await call(putPreferences, host, code, "PUT", "/preferences", PREFS);
    expect(saved.status).toBe(200);
  }

  const joinedBen = await call(joinSession, ben, code, "POST", "/join", { display_name: "Ben" });
  expect(joinedBen.status).toBe(201);
  const saved = await call(putPreferences, ben, code, "PUT", "/preferences", PREFS);
  expect(saved.status).toBe(200);

  const searched = await call(search, host, code, "POST", "/search");
  expect(searched.status).toBe(200);

  return { code, host, ben, hostId, benId: joinedBen.json.participant_id as string };
}

beforeEach(() => {
  fakeDb.reset();
  mocks.provider = mockProvider(places());
  mocks.llm = scriptedLLM([LLM_ANSWER]);
});

// ---- the full flow ---------------------------------------------------------

describe("full session, two participants", () => {
  it("runs from create to a result with the right winner", async () => {
    const { code, host, ben, hostId, benId } = await startSession({ hostJoins: true });
    const stranger = new Jar();

    // The search stored a validated shortlist of 3 and moved to voting.
    const asBen = await call(getSession, ben, code, "GET", "");
    expect(asBen.json.status).toBe("voting");
    const shortlist = asBen.json.shortlist as { ranked_by: string; picks: { place_id: string; rank: number; reason: string }[] };
    expect(shortlist.ranked_by).toBe("llm");
    expect(shortlist.picks.map((p) => p.place_id)).toEqual(["pizza-1", "thai-1", "thai-2"]);
    expect(asBen.json.votes).toEqual({
      counts: { "pizza-1": 0, "thai-1": 0, "thai-2": 0 },
      voted: 0,
      total: 2,
      my_vote: null,
    });

    // Someone with only the join code sees no shortlist, no votes and no topic.
    const asStranger = await call(getSession, stranger, code, "GET", "");
    expect(asStranger.json.status).toBe("voting");
    expect(asStranger.json).not.toHaveProperty("shortlist");
    expect(asStranger.json).not.toHaveProperty("votes");
    expect((asStranger.json.viewer as { votes_topic: unknown }).votes_topic).toBeNull();

    // Ben votes for Thai Two; the host votes for Thai One.
    const benFirst = await call(vote, ben, code, "POST", "/vote", { place_id: "thai-2" });
    expect(benFirst.status).toBe(200);
    expect(benFirst.json).toMatchObject({ voted: 1, total: 2, my_vote: "thai-2" });
    const hostVote = await call(vote, host, code, "POST", "/vote", { place_id: "thai-1" });
    expect(hostVote.json).toMatchObject({ voted: 2, my_vote: "thai-1" });

    // Ben changes his vote: the old choice stops counting.
    const benChanged = await call(vote, ben, code, "POST", "/vote", { place_id: "pizza-1" });
    expect(benChanged.json).toEqual({
      counts: { "pizza-1": 1, "thai-1": 1, "thai-2": 0 },
      voted: 2,
      total: 2,
      my_vote: "pizza-1",
    });
    expect(fakeDb.tables.votes).toHaveLength(2);

    // Each person sees only their own vote.
    const hostView = await call(getSession, host, code, "GET", "");
    expect((hostView.json.votes as { my_vote: string }).my_vote).toBe("thai-1");

    // A place that is not on the shortlist is refused, by the route and by the database.
    const offList = await call(vote, ben, code, "POST", "/vote", { place_id: "pizza-2" });
    expect(offList.status).toBe(422);
    const sessionId = fakeDb.tables.sessions[0].id as string;
    expect(await castVote(sessionId, benId, "pizza-2")).toBe("not_shortlisted");
    expect(await castVote(sessionId, benId, "never-found")).toBe("not_shortlisted");

    // A stranger cannot vote, and a participant cannot close.
    expect((await call(vote, stranger, code, "POST", "/vote", { place_id: "thai-1" })).status).toBe(401);
    expect((await call(close, ben, code, "POST", "/close")).status).toBe(403);
    expect((await call(close, stranger, code, "POST", "/close")).status).toBe(403);

    // The host closes. One vote each for pizza-1 and thai-1 is a tie: the lower rank wins.
    const closed = await call(close, host, code, "POST", "/close");
    expect(closed.status).toBe(200);
    expect(closed.json.winner_place_id).toBe("pizza-1");

    // Votes after close are refused and change nothing; closing twice is refused.
    const late = await call(vote, ben, code, "POST", "/vote", { place_id: "thai-1" });
    expect(late.status).toBe(409);
    expect(fakeDb.tables.votes).toHaveLength(2);
    expect((await call(close, host, code, "POST", "/close")).status).toBe(409);

    // The result reads the same for everyone who joined.
    const result = await call(getSession, ben, code, "GET", "");
    expect(result.json.status).toBe("closed");
    expect(result.json.winner_place_id).toBe("pizza-1");
    expect((result.json.votes as { counts: unknown }).counts).toEqual({
      "pizza-1": 1,
      "thai-1": 1,
      "thai-2": 0,
    });

    // Live updates carry counts only, never who voted for what.
    const voteBroadcasts = fakeDb.broadcasts.filter((b) => b.event === "votes");
    expect(voteBroadcasts.length).toBeGreaterThanOrEqual(3);
    for (const b of voteBroadcasts) {
      expect(Object.keys(b.payload).sort()).toEqual(["counts", "total", "voted"]);
      const text = JSON.stringify(b);
      for (const id of [hostId, benId]) expect(text).not.toContain(id as string);
    }
    expect(fakeDb.broadcasts.some((b) => b.event === "closed")).toBe(true);
    // The vote topic is not the host's submission topic.
    const topics = new Set(fakeDb.broadcasts.map((b) => b.topic));
    const submittedTopics = fakeDb.broadcasts.filter((b) => b.event === "submitted").map((b) => b.topic);
    for (const t of voteBroadcasts.map((b) => b.topic)) expect(submittedTopics).not.toContain(t);
    expect(topics.size).toBeGreaterThanOrEqual(2);
  });

  it("gives the win to the rank 1 pick when nobody votes", async () => {
    const { code, host } = await startSession({ hostJoins: true });
    const closed = await call(close, host, code, "POST", "/close");
    expect(closed.json.winner_place_id).toBe("pizza-1");
  });

  it("rejects a vote while the group is still collecting answers", async () => {
    const host = new Jar();
    const created = await createSession(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lat: 37.7749,
          lng: -122.4194,
          radius_m: 1500,
          meal_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      }),
    );
    host.absorb(created);
    const code = ((await created.json()) as { join_code: string }).join_code;
    await call(joinSession, host, code, "POST", "/join", { display_name: "Hannah" });

    expect((await call(vote, host, code, "POST", "/vote", { place_id: "pizza-1" })).status).toBe(409);
    expect((await call(close, host, code, "POST", "/close")).status).toBe(409);
  });
});

describe("the host who never joined", () => {
  it("can join while voting and then vote, but nobody else can join", async () => {
    const { code, host, ben } = await startSession({ hostJoins: false });

    // Before joining, the host can see the vote but has no participant row to vote with.
    const before = await call(getSession, host, code, "GET", "");
    expect((before.json.viewer as { participant_id: unknown }).participant_id).toBeNull();
    expect((before.json.votes as { total: number }).total).toBe(1);
    expect((await call(vote, host, code, "POST", "/vote", { place_id: "thai-1" })).status).toBe(401);

    // A newcomer cannot join once the search has run.
    const newcomer = new Jar();
    const blocked = await call(joinSession, newcomer, code, "POST", "/join", { display_name: "Cy" });
    expect(blocked.status).toBe(409);

    // The host can, and then counts as one of the voters.
    const joined = await call(joinSession, host, code, "POST", "/join", { display_name: "Hannah" });
    expect(joined.status).toBe(201);
    const after = await call(vote, host, code, "POST", "/vote", { place_id: "thai-1" });
    expect(after.status).toBe(200);
    expect(after.json).toMatchObject({ voted: 1, total: 2, my_vote: "thai-1" });

    // Everyone's page is told the new total.
    const last = fakeDb.broadcasts.filter((b) => b.event === "votes").at(-1);
    expect(last?.payload).toMatchObject({ voted: 1, total: 2 });

    // Ben still cannot rejoin as a second person, but is not harmed.
    expect((await call(getSession, ben, code, "GET", "")).status).toBe(200);
  });
});
