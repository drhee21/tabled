import { createHash } from "node:crypto";
import type { VoteCounts } from "./api-types";
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

/**
 * Broadcast topic for live vote counts, shared by everyone who joined. Derived
 * from a different digest than the host topic, so knowing one tells you nothing
 * about the other. Only joined viewers are ever given it, and events carry
 * counts only.
 */
export function votesRealtimeTopic(hostTokenHash: string): string {
  const digest = createHash("sha256")
    .update(`votes:${hostTokenHash}`)
    .digest("hex");
  return `votes-${digest.slice(0, 32)}`;
}

/** Send one broadcast event. Failure is logged and never fails the request. */
async function broadcast(topic: string, event: string, payload: Record<string, unknown>) {
  const db = getDb();
  const channel = db.channel(topic);
  try {
    const res = await channel.httpSend(event, payload);
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

/** Tell the host's page that a participant submitted. Failure never fails the submit. */
export async function broadcastSubmitted(
  hostTokenHash: string,
  participantId: string,
): Promise<void> {
  await broadcast(hostRealtimeTopic(hostTokenHash), "submitted", {
    participant_id: participantId,
  });
}

/** Tell everyone who joined the new vote totals. Counts only, never who voted. */
export async function broadcastVotes(hostTokenHash: string, counts: VoteCounts): Promise<void> {
  await broadcast(votesRealtimeTopic(hostTokenHash), "votes", { ...counts });
}

/** Tell everyone who joined that voting is over, so they load the result. */
export async function broadcastClosed(hostTokenHash: string): Promise<void> {
  await broadcast(votesRealtimeTopic(hostTokenHash), "closed", {});
}
