import { getDb } from "./db";
import type { PreferencesInput } from "./schemas";

/** Insert or update one participant's answers. Resubmitting replaces them. */
export async function savePreferences(
  participantId: string,
  input: PreferencesInput,
): Promise<void> {
  const { error } = await getDb()
    .from("preferences")
    .upsert(
      {
        participant_id: participantId,
        dietary: input.dietary,
        budget_min: input.budget_min,
        budget_max: input.budget_max,
        cuisines_want: input.cuisines_want,
        cuisines_avoid: input.cuisines_avoid,
        note: input.note,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "participant_id" },
    );
  if (error) throw new Error(error.message);
}

/** A participant's own answers, for prefilling their form. Never call this for someone else. */
export async function getOwnPreferences(
  participantId: string,
): Promise<PreferencesInput | null> {
  const { data, error } = await getDb()
    .from("preferences")
    .select("dietary, budget_min, budget_max, cuisines_want, cuisines_avoid, note")
    .eq("participant_id", participantId)
    .maybeSingle<PreferencesInput>();
  if (error) throw new Error(error.message);
  return data;
}

/** Ids only. Contents, including notes, are never selected here. */
export async function listSubmittedParticipantIds(
  participantIds: string[],
): Promise<Set<string>> {
  if (participantIds.length === 0) return new Set();
  const { data, error } = await getDb()
    .from("preferences")
    .select("participant_id")
    .in("participant_id", participantIds);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: { participant_id: string }) => r.participant_id));
}
