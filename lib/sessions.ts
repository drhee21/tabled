import { getDb } from "./db";
import type { CreateSessionInput, SessionStatus } from "./schemas";
import { hashToken, newJoinCode, newToken } from "./tokens";

export interface SessionRow {
  id: string;
  join_code: string;
  host_token_hash: string;
  lat: number;
  lng: number;
  radius_m: number;
  meal_time: string;
  status: SessionStatus;
  search_count: number;
  created_at: string;
  expires_at: string;
}

export interface ParticipantRow {
  id: string;
  session_id: string;
  display_name: string;
  token_hash: string;
  joined_at: string;
}

export type StateCheck =
  | { ok: true }
  | { ok: false; status: 409 | 410; error: string };

type SessionState = Pick<SessionRow, "status" | "expires_at">;

/** Pure checks so the state rules can be unit tested without a database. */
function checkCollecting(
  session: SessionState,
  notCollectingError: string,
  now: Date,
): StateCheck {
  if (isExpired(session, now)) {
    return { ok: false, status: 410, error: "This session has expired" };
  }
  if (session.status !== "collecting") {
    return { ok: false, status: 409, error: notCollectingError };
  }
  return { ok: true };
}

/**
 * Joining closes when the search starts. The one exception is the host: if they
 * never joined, they may join while voting so they can cast a vote too.
 */
export function checkCanJoin(
  session: SessionState,
  now: Date = new Date(),
  options: { host?: boolean } = {},
): StateCheck {
  if (options.host && session.status === "voting" && !isExpired(session, now)) {
    return { ok: true };
  }
  return checkCollecting(
    session,
    "This session is no longer accepting new people",
    now,
  );
}

function checkVoting(
  session: SessionState,
  notVotingError: Record<Exclude<SessionStatus, "voting">, string>,
  now: Date,
): StateCheck {
  if (isExpired(session, now)) {
    return { ok: false, status: 410, error: "This session has expired" };
  }
  if (session.status !== "voting") {
    return { ok: false, status: 409, error: notVotingError[session.status] };
  }
  return { ok: true };
}

export function checkCanVote(session: SessionState, now: Date = new Date()): StateCheck {
  return checkVoting(
    session,
    {
      collecting: "Voting has not started yet",
      searching: "Voting has not started yet",
      closed: "Voting has closed",
    },
    now,
  );
}

export function checkCanClose(session: SessionState, now: Date = new Date()): StateCheck {
  return checkVoting(
    session,
    {
      collecting: "There is nothing to close yet. Run a search first",
      searching: "There is nothing to close yet. Run a search first",
      closed: "Voting is already closed",
    },
    now,
  );
}

export function checkCanSubmitPreferences(
  session: SessionState,
  now: Date = new Date(),
): StateCheck {
  return checkCollecting(
    session,
    "Preferences can no longer be changed for this session",
    now,
  );
}

export function isExpired(
  session: Pick<SessionRow, "expires_at">,
  now: Date = new Date(),
): boolean {
  return Date.parse(session.expires_at) <= now.getTime();
}

const UNIQUE_VIOLATION = "23505";
const MAX_CODE_ATTEMPTS = 5;

export async function createSession(
  input: CreateSessionInput,
): Promise<{ session: SessionRow; hostToken: string }> {
  const hostToken = newToken();
  const db = getDb();

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const { data, error } = await db
      .from("sessions")
      .insert({
        join_code: newJoinCode(),
        host_token_hash: hashToken(hostToken),
        lat: input.lat,
        lng: input.lng,
        radius_m: input.radius_m,
        meal_time: input.meal_time,
      })
      .select()
      .single<SessionRow>();

    if (!error) return { session: data, hostToken };
    if (error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
  }
  throw new Error("Could not allocate a unique join code");
}

export async function findSessionByCode(
  code: string,
): Promise<SessionRow | null> {
  const { data, error } = await getDb()
    .from("sessions")
    .select()
    .eq("join_code", code)
    .maybeSingle<SessionRow>();
  if (error) throw new Error(error.message);
  return data;
}

export async function findParticipantByToken(
  sessionId: string,
  token: string | undefined,
): Promise<ParticipantRow | null> {
  if (!token) return null;
  const { data, error } = await getDb()
    .from("participants")
    .select()
    .eq("session_id", sessionId)
    .eq("token_hash", hashToken(token))
    .maybeSingle<ParticipantRow>();
  if (error) throw new Error(error.message);
  return data;
}

export async function addParticipant(
  sessionId: string,
  displayName: string,
): Promise<{ participant: ParticipantRow; token: string }> {
  const token = newToken();
  const { data, error } = await getDb()
    .from("participants")
    .insert({
      session_id: sessionId,
      display_name: displayName,
      token_hash: hashToken(token),
    })
    .select()
    .single<ParticipantRow>();
  if (error) throw new Error(error.message);
  return { participant: data, token };
}

export async function listParticipants(
  sessionId: string,
): Promise<Pick<ParticipantRow, "id" | "display_name" | "joined_at">[]> {
  const { data, error } = await getDb()
    .from("participants")
    .select("id, display_name, joined_at")
    .eq("session_id", sessionId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function isHost(session: SessionRow, token: string | undefined): boolean {
  return !!token && hashToken(token) === session.host_token_hash;
}
