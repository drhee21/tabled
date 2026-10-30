// Checks the model's answer before anything is stored. Pure: no I/O, so the
// invented-ID and malformed-output cases are tested without a model.
import { z } from "zod";
import type { RankedPick } from "./types";

export const MIN_PICKS = 3;
export const MAX_PICKS = 5;
export const MAX_REASON_LENGTH = 140;

/**
 * Why an answer was rejected. These are fixed codes and never quote the model's
 * output, so they are safe to log and to send back in a retry prompt.
 */
export type ValidationIssue =
  | "not_json"
  | "wrong_shape"
  | "too_few_picks"
  | "too_many_picks"
  | "unknown_place_id"
  | "duplicate_place_id"
  | "duplicate_rank"
  | "empty_reason"
  | "reason_too_long";

export type ValidationResult =
  | { ok: true; picks: RankedPick[] }
  | { ok: false; issues: ValidationIssue[] };

const answerSchema = z.object({
  picks: z.array(
    z.object({
      place_id: z.string(),
      rank: z.number().int().min(1),
      reason: z.string(),
    }),
  ),
});

/**
 * Accept the model's raw text only if it is JSON in the contract's shape, picks
 * 3 to 5 places from `candidateIds`, and repeats no place or rank. Reasons are
 * trimmed. Valid picks come back sorted by rank and renumbered 1..n.
 */
export function validateRanking(
  raw: string,
  candidateIds: Iterable<string>,
): ValidationResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, issues: ["not_json"] };
  }

  const parsed = answerSchema.safeParse(json);
  if (!parsed.success) return { ok: false, issues: ["wrong_shape"] };

  const known = new Set(candidateIds);
  const { picks } = parsed.data;
  const issues = new Set<ValidationIssue>();

  if (picks.length < MIN_PICKS) issues.add("too_few_picks");
  if (picks.length > MAX_PICKS) issues.add("too_many_picks");
  if (picks.some((p) => !known.has(p.place_id))) issues.add("unknown_place_id");
  if (new Set(picks.map((p) => p.place_id)).size !== picks.length) {
    issues.add("duplicate_place_id");
  }
  if (new Set(picks.map((p) => p.rank)).size !== picks.length) issues.add("duplicate_rank");
  for (const p of picks) {
    const reason = p.reason.trim();
    if (reason === "") issues.add("empty_reason");
    else if (reason.length > MAX_REASON_LENGTH) issues.add("reason_too_long");
  }

  if (issues.size > 0) return { ok: false, issues: [...issues] };

  const ordered = [...picks]
    .sort((a, b) => a.rank - b.rank)
    .map((p, i) => ({ place_id: p.place_id, rank: i + 1, reason: p.reason.trim() }));
  return { ok: true, picks: ordered };
}
