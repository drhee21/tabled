import { NextResponse, type NextRequest } from "next/server";
import { listCandidateSummaries } from "@/lib/candidates";
import { jsonError, serverError } from "@/lib/http";
import { getOwnPreferences, listSubmittedParticipantIds } from "@/lib/preferences";
import { hostRealtimeTopic, votesRealtimeTopic } from "@/lib/realtime";
import { getShortlist } from "@/lib/recommendations";
import { readVotes } from "@/lib/votes";
import {
  findParticipantByToken,
  findSessionByCode,
  isExpired,
  isHost,
  listParticipants,
} from "@/lib/sessions";
import {
  hostCookieName,
  normalizeJoinCode,
  participantCookieName,
} from "@/lib/tokens";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/sessions/[code]">,
) {
  const code = normalizeJoinCode((await ctx.params).code);
  if (!code) return jsonError(404, "Session not found");

  try {
    const session = await findSessionByCode(code);
    if (!session) return jsonError(404, "Session not found");
    if (isExpired(session)) return jsonError(410, "This session has expired");

    const host = isHost(session, request.cookies.get(hostCookieName(code))?.value);
    const [participants, me] = await Promise.all([
      listParticipants(session.id),
      findParticipantByToken(
        session.id,
        request.cookies.get(participantCookieName(code))?.value,
      ),
    ]);

    // Who has submitted goes to the host only. A participant gets their own
    // answers back. Nobody else's preference contents are ever selected.
    const [submittedIds, ownPreferences] = await Promise.all([
      host
        ? listSubmittedParticipantIds(participants.map((p) => p.id))
        : Promise.resolve(null),
      me ? getOwnPreferences(me.id) : Promise.resolve(null),
    ]);

    // The host also sees the places the last search kept.
    const candidates = host ? await listCandidateSummaries(session) : null;

    // The shortlist goes to people who joined, not to strangers with the link.
    const shortlist = host || me ? await getShortlist(session) : null;

    // Vote totals and the viewer's own vote, never anyone else's. Joined people only.
    const voting = session.status === "voting" || session.status === "closed";
    const votes = voting && (host || me) ? await readVotes(session.id, me?.id ?? null) : null;

    // Coordinates are deliberately left out of the response.
    return NextResponse.json({
      join_code: session.join_code,
      status: session.status,
      radius_m: session.radius_m,
      meal_time: session.meal_time,
      expires_at: session.expires_at,
      participants: participants.map((p) =>
        submittedIds ? { ...p, submitted: submittedIds.has(p.id) } : p,
      ),
      viewer: {
        is_host: host,
        participant_id: me?.id ?? null,
        preferences: ownPreferences,
        realtime_topic: host ? hostRealtimeTopic(session.host_token_hash) : null,
        votes_topic:
          host || me ? votesRealtimeTopic(session.host_token_hash) : null,
      },
      ...(shortlist && { shortlist }),
      ...(votes && { votes: votes.state }),
      ...(votes && session.status === "closed" && { winner_place_id: votes.tally.winner }),
      ...(candidates && {
        host: { searches_used: session.search_count, candidates },
      }),
    });
  } catch (err) {
    return serverError(err);
  }
}
