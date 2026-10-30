import type { CandidateSummary } from "./api-types";
import { getDb } from "./db";
import { distanceMeters } from "./places/geo";
import type { ParticipantAnswers } from "./places/search";
import type { ScoredCandidate } from "./places/types";
import type { SessionRow } from "./sessions";

/**
 * Move collecting -> searching and use up one search, in a single update that
 * only matches if nothing changed since the session was read. Returns null if
 * another request got there first.
 */
export async function claimSearch(session: SessionRow): Promise<SessionRow | null> {
  const { data, error } = await getDb()
    .from("sessions")
    .update({ status: "searching", search_count: session.search_count + 1 })
    .eq("id", session.id)
    .eq("status", "collecting")
    .eq("search_count", session.search_count)
    .select()
    .maybeSingle<SessionRow>();
  if (error) throw new Error(error.message);
  return data;
}

/** Back to collecting. Pass the previous count to give the search back after a failed call. */
export async function releaseSearch(sessionId: string, searchCount: number): Promise<void> {
  const { error } = await getDb()
    .from("sessions")
    .update({ status: "collecting", search_count: searchCount })
    .eq("id", sessionId)
    .eq("status", "searching");
  if (error) throw new Error(error.message);
}

/** Answers from everyone who has submitted. Server-only: it reads preference contents. */
export async function listSubmittedAnswers(sessionId: string): Promise<ParticipantAnswers[]> {
  const db = getDb();
  const { data: people, error: peopleError } = await db
    .from("participants")
    .select("id, display_name")
    .eq("session_id", sessionId);
  if (peopleError) throw new Error(peopleError.message);
  if (!people || people.length === 0) return [];

  const { data: prefs, error: prefsError } = await db
    .from("preferences")
    .select("participant_id, dietary, budget_min, budget_max, cuisines_want, cuisines_avoid")
    .in(
      "participant_id",
      people.map((p: { id: string }) => p.id),
    );
  if (prefsError) throw new Error(prefsError.message);

  const names = new Map(people.map((p: { id: string; display_name: string }) => [p.id, p.display_name]));
  type PrefsRow = Omit<ParticipantAnswers, "display_name"> & { participant_id: string };
  return (prefs ?? []).map((row: PrefsRow) => ({
    display_name: names.get(row.participant_id) ?? "Someone",
    dietary: row.dietary,
    budget_min: row.budget_min,
    budget_max: row.budget_max,
    cuisines_want: row.cuisines_want,
    cuisines_avoid: row.cuisines_avoid,
  }));
}

/** Replace the session's candidates with a fresh search result. */
export async function replaceCandidates(
  sessionId: string,
  candidates: readonly ScoredCandidate[],
): Promise<void> {
  const db = getDb();
  const { error: deleteError } = await db.from("candidates").delete().eq("session_id", sessionId);
  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await db.from("candidates").insert(
    candidates.map((c) => ({
      session_id: sessionId,
      place_id: c.place_id,
      name: c.name,
      address: c.address,
      lat: c.lat,
      lng: c.lng,
      price_level: c.price_level,
      cuisine_tags: c.cuisine_tags,
      rating: c.rating,
      open_now: c.open_now,
      dietary_unknown: c.dietary_unknown,
      raw: c.raw,
    })),
  );
  if (insertError) throw new Error(insertError.message);
}

export function toSummary(c: ScoredCandidate): CandidateSummary {
  return {
    place_id: c.place_id,
    name: c.name,
    address: c.address,
    price_level: c.price_level,
    cuisine_tags: c.cuisine_tags,
    rating: c.rating,
    open_now: c.open_now,
    dietary_unknown: c.dietary_unknown,
    distance_m: c.distance_m,
  };
}

/** The stored candidates for the host page, nearest first. Distance is recomputed, not stored. */
export async function listCandidateSummaries(
  session: Pick<SessionRow, "id" | "lat" | "lng">,
): Promise<CandidateSummary[]> {
  const { data, error } = await getDb()
    .from("candidates")
    .select(
      "place_id, name, address, lat, lng, price_level, cuisine_tags, rating, open_now, dietary_unknown",
    )
    .eq("session_id", session.id);
  if (error) throw new Error(error.message);

  type Row = Omit<CandidateSummary, "distance_m"> & { lat: number; lng: number };
  return (data ?? [])
    .map(({ lat, lng, ...rest }: Row) => ({
      ...rest,
      distance_m: distanceMeters(session, { lat, lng }),
    }))
    .sort(
      (a, b) =>
        a.distance_m - b.distance_m ||
        (b.rating ?? -1) - (a.rating ?? -1) ||
        a.place_id.localeCompare(b.place_id),
    );
}
