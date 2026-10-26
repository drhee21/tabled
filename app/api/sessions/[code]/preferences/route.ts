import { NextResponse, type NextRequest } from "next/server";
import { jsonError, parseBody, serverError } from "@/lib/http";
import { savePreferences } from "@/lib/preferences";
import { broadcastSubmitted } from "@/lib/realtime";
import { preferencesSchema } from "@/lib/schemas";
import {
  checkCanSubmitPreferences,
  findParticipantByToken,
  findSessionByCode,
} from "@/lib/sessions";
import { normalizeJoinCode, participantCookieName } from "@/lib/tokens";

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/sessions/[code]/preferences">,
) {
  const code = normalizeJoinCode((await ctx.params).code);
  if (!code) return jsonError(404, "Session not found");

  try {
    const session = await findSessionByCode(code);
    if (!session) return jsonError(404, "Session not found");

    const check = checkCanSubmitPreferences(session);
    if (!check.ok) return jsonError(check.status, check.error);

    const participant = await findParticipantByToken(
      session.id,
      request.cookies.get(participantCookieName(code))?.value,
    );
    if (!participant) return jsonError(401, "Join this session first");

    const parsed = await parseBody(request, preferencesSchema);
    if ("response" in parsed) return parsed.response;

    await savePreferences(participant.id, parsed.data);
    await broadcastSubmitted(session.host_token_hash, participant.id);

    return NextResponse.json({ submitted: true });
  } catch (err) {
    return serverError(err);
  }
}
