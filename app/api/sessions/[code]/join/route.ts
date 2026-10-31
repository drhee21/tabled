import { NextResponse, type NextRequest } from "next/server";
import { jsonError, parseBody, serverError } from "@/lib/http";
import { broadcastVotes } from "@/lib/realtime";
import { joinSessionSchema } from "@/lib/schemas";
import {
  addParticipant,
  checkCanJoin,
  findParticipantByToken,
  findSessionByCode,
  isHost,
} from "@/lib/sessions";
import { readVotes, toCounts } from "@/lib/votes";
import {
  hostCookieName,
  normalizeJoinCode,
  participantCookieName,
  tokenCookieOptions,
} from "@/lib/tokens";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/sessions/[code]/join">,
) {
  const code = normalizeJoinCode((await ctx.params).code);
  if (!code) return jsonError(404, "Session not found");

  const parsed = await parseBody(request, joinSessionSchema);
  if ("response" in parsed) return parsed.response;

  try {
    const session = await findSessionByCode(code);
    if (!session) return jsonError(404, "Session not found");

    const host = isHost(session, request.cookies.get(hostCookieName(code))?.value);
    const check = checkCanJoin(session, new Date(), { host });
    if (!check.ok) return jsonError(check.status, check.error);

    const cookieName = participantCookieName(code);
    // Rejoining from the same browser returns the existing participant.
    const existing = await findParticipantByToken(
      session.id,
      request.cookies.get(cookieName)?.value,
    );
    if (existing) {
      return NextResponse.json({
        participant_id: existing.id,
        display_name: existing.display_name,
      });
    }

    const { participant, token } = await addParticipant(
      session.id,
      parsed.data.display_name,
    );
    // A host joining during voting changes "X of N voted" for everyone.
    if (session.status === "voting") {
      const { state } = await readVotes(session.id, participant.id);
      await broadcastVotes(session.host_token_hash, toCounts(state));
    }

    const res = NextResponse.json(
      {
        participant_id: participant.id,
        display_name: participant.display_name,
        participant_token: token,
      },
      { status: 201 },
    );
    res.cookies.set(cookieName, token, tokenCookieOptions);
    return res;
  } catch (err) {
    return serverError(err);
  }
}
