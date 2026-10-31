"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ApiErrorResponse, Shortlist, VoteState } from "@/lib/api-types";
import { cx } from "@/lib/cx";
import { MAPS_ATTRIBUTION, PlaceDetails } from "./place-details";

/** Voting: pick a place, see live counts, and (host) close voting. */
export function VotePanel({
  code,
  shortlist,
  votes,
  canVote,
  isHost,
  onVotes,
  onClosed,
}: {
  code: string;
  shortlist: Shortlist;
  votes: VoteState;
  /** False for a host who has not joined yet: they can watch and close, not vote. */
  canVote: boolean;
  isHost: boolean;
  onVotes: (state: VoteState) => void;
  onClosed: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);

  async function vote(placeId: string) {
    if (!canVote || pending || placeId === votes.my_vote) return;
    setError(null);
    setPending(placeId);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: placeId }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        setError((body as ApiErrorResponse).error);
        // Voting may have closed or the shortlist changed: show what is true now.
        await onClosed();
        return;
      }
      onVotes(body as VoteState);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function close() {
    setError(null);
    setClosing(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/close`, {
        method: "POST",
      });
      if (!res.ok) setError(((await res.json()) as ApiErrorResponse).error);
      await onClosed();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setClosing(false);
      setConfirming(false);
    }
  }

  const waiting = votes.total - votes.voted;

  return (
    <Card className="animate-rise">
      <h2 className="text-xl font-extrabold">Vote for where to eat</h2>
      <p className="mt-1 text-ink-soft">
        {canVote
          ? "Tap a place to vote. You can change your vote until voting closes."
          : "Join the table to cast your own vote. You can still close voting."}
      </p>
      <p className="mt-3 font-bold" aria-live="polite">
        {votes.voted} of {votes.total} voted
      </p>

      <ol className="mt-4 flex flex-col gap-3">
        {shortlist.picks.map((p) => {
          const count = votes.counts[p.place_id] ?? 0;
          const mine = votes.my_vote === p.place_id;
          return (
            <li key={p.place_id}>
              <button
                type="button"
                role="radio"
                aria-checked={mine}
                disabled={!canVote || pending !== null}
                onClick={() => void vote(p.place_id)}
                className={cx(
                  "w-full rounded-control bg-brand-50 px-4 py-3 text-left ring-2 transition duration-150 ease-out",
                  "enabled:hover:bg-brand-100 enabled:active:scale-[0.99] disabled:cursor-default",
                  mine ? "bg-brand-100 ring-brand-700" : "ring-transparent",
                  pending === p.place_id && "opacity-70",
                )}
              >
                <div className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-700 font-extrabold text-white"
                  >
                    {p.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <PlaceDetails place={p} />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="h-2 flex-1 overflow-hidden rounded-full bg-white"
                  >
                    <div
                      className="h-full rounded-full bg-brand-700 transition-[width] duration-300 ease-out"
                      style={{ width: `${votes.total > 0 ? (count / votes.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="min-w-[4.5rem] text-right text-sm font-bold">
                    {count} {count === 1 ? "vote" : "votes"}
                  </span>
                </div>
                {mine && <p className="mt-2 text-sm font-bold text-brand-800">Your vote</p>}
              </button>
            </li>
          );
        })}
      </ol>

      {error && (
        <p
          role="alert"
          className="mt-4 animate-rise rounded-control bg-danger-50 px-4 py-3 font-semibold text-danger-700"
        >
          {error}
        </p>
      )}

      {isHost && (
        <div className="mt-6">
          {!confirming ? (
            <Button variant="secondary" fullWidth onClick={() => setConfirming(true)}>
              Close voting
            </Button>
          ) : (
            <div className="animate-rise rounded-control bg-brand-50 p-4">
              <h3 className="text-lg font-extrabold">End voting now?</h3>
              <p className="mt-1 text-ink-soft">
                {waiting > 0
                  ? `${waiting} ${waiting === 1 ? "person hasn’t" : "people haven’t"} voted yet. Their votes won’t count.`
                  : "Everyone has voted."}{" "}
                This can’t be undone.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button fullWidth loading={closing} onClick={() => void close()}>
                  {closing ? "Closing…" : "Yes, show the winner"}
                </Button>
                <Button
                  variant="ghost"
                  fullWidth
                  disabled={closing}
                  onClick={() => setConfirming(false)}
                >
                  Keep voting
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-xs font-semibold text-ink-soft">{MAPS_ATTRIBUTION}</p>
    </Card>
  );
}
