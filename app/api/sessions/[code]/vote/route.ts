import { NextResponse, type NextRequest } from "next/server";
import { jsonError, parseBody, serverError } from "@/lib/http";
import { broadcastVotes } from "@/lib/realtime";
import { voteSchema } from "@/lib/schemas";
import { checkCanVote, findParticipantByToken, findSessionByCode } from "@/lib/sessions";
import { isShortlisted } from "@/lib/tally";
import { normalizeJoinCode, participantCookieName } from "@/lib/tokens";
import { castVote, listShortlistRanks, readVotes, removeVote, toCounts } from "@/lib/votes";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/sessions/[code]/vote">,
) {
  const code = normalizeJoinCode((await ctx.params).code);
  if (!code) return jsonError(404, "Session not found");

  try {
    const session = await findSessionByCode(code);
    if (!session) return jsonError(404, "Session not found");

    const check = checkCanVote(session);
    if (!check.ok) return jsonError(check.status, check.error);

    // The host votes through their participant row, like everyone else.
    const participant = await findParticipantByToken(
      session.id,
      request.cookies.get(participantCookieName(code))?.value,
    );
    if (!participant) return jsonError(401, "Join this session first");

    const parsed = await parseBody(request, voteSchema);
    if ("response" in parsed) return parsed.response;
    const placeId = parsed.data.place_id;

    // Checked here for a clear error; the votes table enforces it too.
    if (!isShortlisted(await listShortlistRanks(session.id), placeId)) {
      return jsonError(422, "That place is not on the shortlist");
    }

    const outcome = await castVote(session.id, participant.id, placeId);
    if (outcome === "not_shortlisted") {
      return jsonError(422, "That place is not on the shortlist");
    }

    // The host may have closed voting between the check above and the write.
    const after = await findSessionByCode(code);
    if (after && after.status !== "voting") {
      await removeVote(session.id, participant.id);
      return jsonError(409, "Voting has closed");
    }

    const { state } = await readVotes(session.id, participant.id);
    await broadcastVotes(session.host_token_hash, toCounts(state));
    return NextResponse.json(state);
  } catch (err) {
    return serverError(err);
  }
}
