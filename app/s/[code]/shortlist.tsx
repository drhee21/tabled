import { Card } from "@/components/ui/Card";
import type { Shortlist as ShortlistData } from "@/lib/api-types";
import { distanceLabel, priceLabel } from "@/lib/format";
import { optionLabel } from "@/lib/preference-options";

/** The ranked places the group will vote on. Read-only until voting is built. */
export function Shortlist({ shortlist }: { shortlist: ShortlistData }) {
  return (
    <Card className="animate-rise">
      <h2 className="text-xl font-extrabold">Your shortlist</h2>
      <p className="mt-1 text-ink-soft">
        {shortlist.ranked_by === "llm"
          ? "Ranked for the group from everyone’s answers."
          : "Ranked by cuisine match, then distance, then rating. Written reasons weren’t available this time."}
      </p>

      <ol className="mt-4 flex flex-col gap-3">
        {shortlist.picks.map((p) => (
          <li key={p.place_id} className="flex gap-3 rounded-control bg-brand-50 px-4 py-3">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-700 font-extrabold text-white"
            >
              {p.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">{p.name}</p>
              {p.address && <p className="text-sm text-ink-soft">{p.address}</p>}
              <p className="mt-1 text-sm font-semibold">
                {distanceLabel(p.distance_m)}
                {p.rating !== null && ` · ★ ${p.rating.toFixed(1)}`}
                {p.price_level !== null && ` · ${priceLabel(p.price_level)}`}
              </p>
              {p.reason && <p className="mt-2 font-semibold text-brand-900">{p.reason}</p>}
              {(p.cuisine_tags.length > 0 || p.dietary_unknown) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.cuisine_tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-brand-800"
                    >
                      {optionLabel(t)}
                    </span>
                  ))}
                  {p.dietary_unknown && (
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-ink-soft">
                      Dietary info unknown
                    </span>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs font-semibold text-ink-soft">
        Place data from Google Maps. Dietary filtering is best-effort, so check with the
        restaurant.
      </p>
    </Card>
  );
}
