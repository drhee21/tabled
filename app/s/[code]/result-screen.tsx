import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Shortlist, VoteState } from "@/lib/api-types";
import { mapsUrl } from "@/lib/maps";
import { MAPS_ATTRIBUTION, PlaceDetails } from "./place-details";

function votesLabel(n: number): string {
  return `${n} ${n === 1 ? "vote" : "votes"}`;
}

/** After voting closes: the winner, then the other picks with their counts. */
export function ResultScreen({
  shortlist,
  votes,
  winnerPlaceId,
}: {
  shortlist: Shortlist;
  votes: VoteState;
  winnerPlaceId: string | null;
}) {
  const winner = shortlist.picks.find((p) => p.place_id === winnerPlaceId) ?? shortlist.picks[0];
  if (!winner) return null;

  const others = shortlist.picks
    .filter((p) => p.place_id !== winner.place_id)
    .sort((a, b) => (votes.counts[b.place_id] ?? 0) - (votes.counts[a.place_id] ?? 0) || a.rank - b.rank);
  const winnerVotes = votes.counts[winner.place_id] ?? 0;

  return (
    <div className="flex flex-col gap-section">
      <Card className="animate-reveal ring-2 ring-brand-700">
        <p className="text-sm font-bold uppercase tracking-widest text-brand-700">
          The group picked
        </p>
        <div className="mt-3 rounded-control bg-brand-50 px-4 py-4">
          <PlaceDetails place={winner} />
        </div>
        <p className="mt-3 font-bold">
          {votes.voted === 0
            ? "Nobody voted, so the top pick wins."
            : `${votesLabel(winnerVotes)} of ${votes.voted} cast`}
        </p>
        <ButtonLink
          href={mapsUrl(winner.name, winner.place_id)}
          external
          fullWidth
          className="mt-4"
        >
          Open in Google Maps
        </ButtonLink>
      </Card>

      {others.length > 0 && (
        <Card className="animate-rise">
          <h2 className="text-xl font-extrabold">The other picks</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {others.map((p) => (
              <li key={p.place_id} className="rounded-control bg-brand-50 px-4 py-3">
                <PlaceDetails place={p} />
                <p className="mt-2 text-sm font-bold">{votesLabel(votes.counts[p.place_id] ?? 0)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-soft">{MAPS_ATTRIBUTION}</p>
        </Card>
      )}
    </div>
  );
}
