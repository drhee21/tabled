import type { RecommendationSummary } from "@/lib/api-types";
import { distanceLabel, priceLabel } from "@/lib/format";
import { Tag } from "@/components/ui/Tag";
import { optionLabel } from "@/lib/preference-options";

/** What we know about a shortlisted place, shared by the vote card and the result. */
export function PlaceDetails({ place }: { place: RecommendationSummary }) {
  return (
    <>
      <p className="font-extrabold">{place.name}</p>
      {place.address && <p className="text-sm text-ink-soft">{place.address}</p>}
      <p className="mt-1 text-sm font-semibold">
        {distanceLabel(place.distance_m)}
        {place.rating !== null && ` · ★ ${place.rating.toFixed(1)}`}
        {place.price_level !== null && ` · ${priceLabel(place.price_level)}`}
      </p>
      {place.reason && <p className="mt-2 font-semibold text-brand-900">{place.reason}</p>}
      {(place.cuisine_tags.length > 0 || place.dietary_unknown) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {place.cuisine_tags.map((t) => (
            <Tag key={t}>{optionLabel(t)}</Tag>
          ))}
          {place.dietary_unknown && <Tag tone="muted">Dietary info unknown</Tag>}
        </div>
      )}
    </>
  );
}

export const MAPS_ATTRIBUTION =
  "Place data from Google Maps. Dietary filtering is best-effort, so check with the restaurant.";
