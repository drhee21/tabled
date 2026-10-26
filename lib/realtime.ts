import { createHash } from "node:crypto";
import { getDb } from "./db";

/**
 * Broadcast topic for one session's host. Derived from the stored host token
 * hash, so it is unguessable and only the host is ever told it. Events on it
 * carry participant ids only, never preference contents.
 */
export function hostRealtimeTopic(hostTokenHash: string): string {
  const digest = createHash("sha256")
    .update(`realtime:${hostTokenHash}`)
    .digest("hex");
  return `host-${digest.slice(0, 32)}`;
}

/** Tell the host's page that a participant submitted. Failure never fails the submit. */
export async function broadcastSubmitted(
  hostTokenHash: string,
  participantId: string,
): Promise<void> {
  const db = getDb();
  const channel = db.channel(hostRealtimeTopic(hostTokenHash));
  try {
    const res = await channel.httpSend("submitted", {
      participant_id: participantId,
    });
    if (!res.success) {
      console.error(`Realtime broadcast failed: ${res.status} ${res.error}`);
    }
  } catch (err) {
    console.error(
      err instanceof Error ? err.message : "Realtime broadcast failed",
    );
  } finally {
    await db.removeChannel(channel);
  }
}
