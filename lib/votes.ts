// Vote storage. Server-only: it reads who voted for what, which no route may
// return. Routes expose counts and the viewer's own vote only.
import type { VoteCounts, VoteState } from "./api-types";
import { getDb } from "./db";
import { listParticipants } from "./sessions";
import { tally, type ShortlistRank, type Tally, type Vote } from "./tally";

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

/** Totals for broadcasting and the viewer's own vote, from one read of the data. */
export async function readVotes(
  sessionId: string,
  viewerParticipantId: string | null,
): Promise<{ state: VoteState; tally: Tally }> {
  const [shortlist, votes, participants] = await Promise.all([
    listShortlistRanks(sessionId),
    listVotes(sessionId),
    listParticipants(sessionId),
  ]);
  const result = tally(shortlist, votes);
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
