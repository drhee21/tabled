import { NextResponse, type NextRequest } from "next/server";
import { jsonError, serverError } from "@/lib/http";
import { broadcastClosed } from "@/lib/realtime";
import { checkCanClose, findSessionByCode, isHost } from "@/lib/sessions";
import { hostCookieName, normalizeJoinCode } from "@/lib/tokens";
import { closeVoting, readVotes } from "@/lib/votes";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/sessions/[code]/close">,
) {
  const code = normalizeJoinCode((await ctx.params).code);
  if (!code) return jsonError(404, "Session not found");

  try {
    const session = await findSessionByCode(code);
    if (!session) return jsonError(404, "Session not found");

    // Host-only: checked on every request, before anything else is revealed.
    if (!isHost(session, request.cookies.get(hostCookieName(code))?.value)) {
      return jsonError(403, "Only the host can close voting");
    }

    const check = checkCanClose(session);
    if (!check.ok) return jsonError(check.status, check.error);

    // Only closes if it is still voting, so a double click closes once.
    if (!(await closeVoting(session.id))) return jsonError(409, "Voting is already closed");
    await broadcastClosed(session.host_token_hash);

    const { tally } = await readVotes(session.id, null);
    return NextResponse.json({ winner_place_id: tally.winner });
  } catch (err) {
    return serverError(err);
  }
}
