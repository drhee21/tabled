// Vote storage. Server-only: it reads who voted for what, which no route may
// return. Routes expose counts and the viewer's own vote only.
import type { VoteCounts, VoteState } from "./api-types";
import { listSubmittedAnswers } from "./candidates";
import { getDb } from "./db";
import { getShortlist } from "./recommendations";
import { listParticipants, type SessionRow } from "./sessions";
import { tally, type ShortlistRank, type Tally, type Vote } from "./tally";
import { tiebreakScore } from "./tiebreak";

const FOREIGN_KEY_VIOLATION = "23503";

/** The session's shortlist as place ids and ranks. */
export async function listShortlistRanks(sessionId: string): Promise<ShortlistRank[]> {
  const { data, error } = await getDb()
    .from("recommendations")
    .select("place_id, rank")
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listVotes(sessionId: string): Promise<Vote[]> {
  const { data, error } = await getDb()
    .from("votes")
    .select("participant_id, place_id")
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Record a vote, replacing the participant's earlier one. The votes table
 * references the shortlist, so the database also refuses a place that is not on
 * it; that comes back as "not_shortlisted".
 */
export async function castVote(
  sessionId: string,
  participantId: string,
  placeId: string,
): Promise<"ok" | "not_shortlisted"> {
  const { error } = await getDb()
    .from("votes")
    .upsert(
      { session_id: sessionId, participant_id: participantId, place_id: placeId },
      { onConflict: "session_id,participant_id" },
    );
  if (!error) return "ok";
  if (error.code === FOREIGN_KEY_VIOLATION) return "not_shortlisted";
  throw new Error(error.message);
}

export async function removeVote(sessionId: string, participantId: string): Promise<void> {
  const { error } = await getDb()
    .from("votes")
    .delete()
    .eq("session_id", sessionId)
    .eq("participant_id", participantId);
  if (error) throw new Error(error.message);
}

/** Move voting -> closed, only if it is still voting. False if someone else closed it first. */
export async function closeVoting(sessionId: string): Promise<boolean> {
  const { data, error } = await getDb()
    .from("sessions")
    .update({ status: "closed" })
    .eq("id", sessionId)
    .eq("status", "voting")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

/** Tiebreak scores for the shortlisted places, from their details and the group's budgets. */
async function tiebreakScores(
  session: Pick<SessionRow, "id" | "lat" | "lng" | "radius_m">,
): Promise<Record<string, number>> {
  const [shortlist, answers] = await Promise.all([
    getShortlist(session),
    listSubmittedAnswers(session.id),
  ]);
  const ctx = { radius_m: session.radius_m, budgets: answers };
  return Object.fromEntries(
    (shortlist?.picks ?? []).map((p) => [p.place_id, tiebreakScore(p, ctx)]),
  );
}

/**
 * Totals for broadcasting and the viewer's own vote, from one read of the data.
 * Pass `tiebreakFor` when the winner matters (voting is closed): a tie for the
 * lead is then broken by score instead of by rank alone. While voting is open
 * only the counts are shown, so the extra reads are skipped.
 */
export async function readVotes(
  sessionId: string,
  viewerParticipantId: string | null,
  tiebreakFor?: Pick<SessionRow, "id" | "lat" | "lng" | "radius_m">,
): Promise<{ state: VoteState; tally: Tally }> {
  const [shortlist, votes, participants] = await Promise.all([
    listShortlistRanks(sessionId),
    listVotes(sessionId),
    listParticipants(sessionId),
  ]);
  let result = tally(shortlist, votes);
  if (tiebreakFor && result.tiedForLead.length > 1) {
    result = tally(shortlist, votes, await tiebreakScores(tiebreakFor));
  }
  const mine = viewerParticipantId
    ? votes.findLast((v) => v.participant_id === viewerParticipantId)
    : undefined;
  return {
    tally: result,
    state: {
      counts: result.counts,
      voted: result.voted,
      total: participants.length,
      my_vote: mine?.place_id ?? null,
    },
  };
}

export function toCounts(state: VoteState): VoteCounts {
  return { counts: state.counts, voted: state.voted, total: state.total };
}
