import { NextResponse, type NextRequest } from "next/server";
import { jsonError, serverError } from "@/lib/http";
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

    const [participants, me] = await Promise.all([
      listParticipants(session.id),
      findParticipantByToken(
        session.id,
        request.cookies.get(participantCookieName(code))?.value,
      ),
    ]);

    // Coordinates are deliberately left out of the response.
    return NextResponse.json({
      join_code: session.join_code,
      status: session.status,
      radius_m: session.radius_m,
      meal_time: session.meal_time,
      expires_at: session.expires_at,
      participants,
      viewer: {
        is_host: isHost(session, request.cookies.get(hostCookieName(code))?.value),
        participant_id: me?.id ?? null,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
