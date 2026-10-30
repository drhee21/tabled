import { NextResponse, type NextRequest } from "next/server";
import {
  claimSearch,
  listSubmittedAnswers,
  releaseSearch,
  replaceCandidates,
  toSummary,
} from "@/lib/candidates";
import { jsonError, serverError } from "@/lib/http";
import { getLLMClient } from "@/lib/llm";
import { rankCandidates } from "@/lib/llm/rank";
import { getPlacesProvider, PlacesProviderError } from "@/lib/places";
import { searchCandidates } from "@/lib/places/search";
import { getShortlist, replaceRecommendations } from "@/lib/recommendations";
import { MAX_SEARCHES } from "@/lib/search-limits";
import { findSessionByCode, isExpired, isHost } from "@/lib/sessions";
import { hostCookieName, normalizeJoinCode } from "@/lib/tokens";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/sessions/[code]/search">,
) {
  const code = normalizeJoinCode((await ctx.params).code);
  if (!code) return jsonError(404, "Session not found");

  try {
    const session = await findSessionByCode(code);
    if (!session) return jsonError(404, "Session not found");

    // Host-only: checked on every request, before anything else is revealed.
    if (!isHost(session, request.cookies.get(hostCookieName(code))?.value)) {
      return jsonError(403, "Only the host can start a search");
    }
    if (isExpired(session)) return jsonError(410, "This session has expired");
    if (session.status !== "collecting") {
      return jsonError(409, "A search can only start while the group is still collecting answers");
    }
    if (session.search_count >= MAX_SEARCHES) {
      return jsonError(429, `This session has used all ${MAX_SEARCHES} searches`);
    }

    // Fail on a missing key before using up a search.
    const provider = getPlacesProvider();
    const llm = getLLMClient();

    const claimed = await claimSearch(session);
    if (!claimed) return jsonError(409, "Another search is already running");

    // From here the session is `searching`. Always put it back to `collecting`.
    let searchCountAfter = claimed.search_count;
    let nextStatus: "collecting" | "voting" = "collecting";
    try {
      const participants = await listSubmittedAnswers(claimed.id);

      let outcome;
      try {
        outcome = await searchCandidates(provider, {
          session: claimed,
          participants,
        });
      } catch (err) {
        if (err instanceof PlacesProviderError) {
          // The call failed, so give the search back.
          searchCountAfter = claimed.search_count - 1;
          console.error(err.message);
          return jsonError(502, "Could not reach the places service. Please try again.");
        }
        throw err;
      }

      if (!outcome.ok) {
        // No Google call means nothing was billed, so give the search back.
        if (outcome.provider_calls === 0) searchCountAfter = claimed.search_count - 1;
        return jsonError(422, outcome.message, {
          found: outcome.found,
          dropped: outcome.dropped,
          budget: outcome.budget,
          provider_calls: outcome.provider_calls,
          searches_used: searchCountAfter,
        });
      }

      await replaceCandidates(claimed.id, outcome.candidates);

      // Rank the filtered list. This never fails the search: if the model
      // cannot give a valid answer twice, code ranks it without reasons.
      const ranking = await rankCandidates(llm, outcome.candidates, participants);
      await replaceRecommendations(claimed.id, ranking.picks);
      const shortlist = await getShortlist(claimed);
      if (!shortlist) throw new Error("Shortlist was not stored");
      nextStatus = "voting";

      return NextResponse.json({
        candidates: outcome.candidates.map(toSummary),
        shortlist,
        budget: outcome.budget,
        dropped: outcome.dropped,
        provider_calls: outcome.provider_calls,
        follow_up_cuisines: outcome.follow_up_cuisines,
        searches_used: claimed.search_count,
      });
    } finally {
      await releaseSearch(claimed.id, searchCountAfter, nextStatus);
    }
  } catch (err) {
    return serverError(err);
  }
}
