import type { RecommendationSummary, Shortlist } from "./api-types";
import { listCandidateSummaries } from "./candidates";
import { getDb } from "./db";
import type { RankedPick } from "./llm/types";
import type { SessionRow } from "./sessions";

/** Store the shortlist. The candidates it points at must already be stored. */
export async function replaceRecommendations(
  sessionId: string,
  picks: readonly RankedPick[],
): Promise<void> {
  const db = getDb();
  const { error: deleteError } = await db
    .from("recommendations")
    .delete()
    .eq("session_id", sessionId);
  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await db.from("recommendations").insert(
    picks.map((p) => ({
      session_id: sessionId,
      place_id: p.place_id,
      rank: p.rank,
      reason: p.reason,
    })),
  );
  if (insertError) throw new Error(insertError.message);
}

/** The stored shortlist in rank order, or null if no search has finished. */
export async function getShortlist(
  session: Pick<SessionRow, "id" | "lat" | "lng">,
): Promise<Shortlist | null> {
  const { data, error } = await getDb()
    .from("recommendations")
    .select("place_id, rank, reason")
    .eq("session_id", session.id);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;

  const summaries = new Map(
    (await listCandidateSummaries(session)).map((c) => [c.place_id, c]),
  );
  const picks: RecommendationSummary[] = (data as RankedPick[])
    .flatMap((r) => {
      const place = summaries.get(r.place_id);
      return place ? [{ ...place, rank: r.rank, reason: r.reason }] : [];
    })
    .sort((a, b) => a.rank - b.rank);

  // Reasons come only from the model, so a shortlist with none was ranked by code.
  return { ranked_by: picks.some((p) => p.reason !== null) ? "llm" : "code", picks };
}
