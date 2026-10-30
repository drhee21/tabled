"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type {
  ApiErrorResponse,
  BudgetSummary,
  CandidateSummary,
  SearchResponse,
} from "@/lib/api-types";
import { distanceLabel, priceLabel } from "@/lib/format";
import { optionLabel } from "@/lib/preference-options";
import { MAX_SEARCHES } from "@/lib/search-limits";

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function budgetNote(budget: BudgetSummary): string | null {
  if (budget.unanimous) return null;
  const range =
    budget.min === budget.max
      ? priceLabel(budget.min)
      : `${priceLabel(budget.min)} to ${priceLabel(budget.max)}`;
  if (budget.left_out.length === 0) {
    return `Budgets didn't all overlap, so this searched ${range}. Each place suits some of you, not all.`;
  }
  return `Budgets didn't all overlap, so this searched ${range}, which leaves out ${budget.left_out.join(", ")}.`;
}

/** Host-only: run a search and show the places it kept. */
export function SearchPanel({
  code,
  searchesUsed,
  candidates,
  participants,
  onSearched,
}: {
  code: string;
  searchesUsed: number;
  candidates: CandidateSummary[];
  /** Everyone who has joined, with whether they have answered. */
  participants: { id: string; display_name: string; submitted?: boolean }[];
  onSearched: () => Promise<void>;
}) {
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  // Every search is a paid call, so the button is hidden behind a check-in question.
  const [confirming, setConfirming] = useState(false);

  const searchesLeft = MAX_SEARCHES - searchesUsed;
  const answered = participants.filter((p) => p.submitted === true);
  const waiting = participants.filter((p) => p.submitted !== true);
  const nobodyAnswered = answered.length === 0;

  async function search() {
    setError(null);
    setSearching(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/search`, {
        method: "POST",
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        const err = body as ApiErrorResponse & { budget?: BudgetSummary | null };
        setBudget(err.budget ?? null);
        setError(err.error);
      } else {
        setBudget((body as SearchResponse).budget);
      }
      await onSearched();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSearching(false);
      setConfirming(false);
    }
  }

  const note = budget ? budgetNote(budget) : null;

  return (
    <Card className="animate-rise">
      <h2 className="text-xl font-extrabold">Find places</h2>
      <p className="mt-1 text-ink-soft">
        Searches open restaurants near you that fit everyone who has answered. You don’t have to
        wait for the whole group.
      </p>

      {participants.length > 0 && (
        <p className="mt-4 font-bold">
          {answered.length} of {participants.length} answered
        </p>
      )}

      {!confirming ? (
        <>
          <Button
            className="mt-4"
            variant="secondary"
            fullWidth
            disabled={searchesLeft <= 0 || nobodyAnswered}
            onClick={() => setConfirming(true)}
          >
            {searchesLeft <= 0
              ? "No searches left"
              : candidates.length > 0
                ? "Search again?"
                : "Ready to search?"}
          </Button>
          {nobodyAnswered && searchesLeft > 0 && (
            <p className="mt-2 text-sm text-ink-soft">
              Wait for at least one person to answer before searching.
            </p>
          )}
        </>
      ) : (
        <div className="mt-4 animate-rise rounded-control bg-brand-50 p-4">
          <h3 className="text-lg font-extrabold">Has everyone answered?</h3>
          {waiting.length === 0 ? (
            <p className="mt-1 text-ink-soft">Everyone here has answered.</p>
          ) : (
            <p className="mt-1 text-ink-soft">
              Still waiting on {joinNames(waiting.map((p) => p.display_name))}. Searching now
              leaves out their answers.
            </p>
          )}
          <p className="mt-1 text-sm text-ink-soft">
            You get {MAX_SEARCHES} searches per session.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button fullWidth loading={searching} onClick={() => void search()}>
              {searching
                ? "Searching…"
                : waiting.length === 0
                  ? "Yes, find places"
                  : "Search without them"}
            </Button>
            <Button
              variant="ghost"
              fullWidth
              disabled={searching}
              onClick={() => setConfirming(false)}
            >
              {waiting.length === 0 ? "Not yet" : "Wait for them"}
            </Button>
          </div>
        </div>
      )}
      <p className="mt-3 text-sm text-ink-soft">
        {searchesLeft > 0
          ? `${searchesLeft} of ${MAX_SEARCHES} searches left`
          : `All ${MAX_SEARCHES} searches used`}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 animate-rise rounded-control bg-danger-50 px-4 py-3 font-semibold text-danger-700"
        >
          {error}
        </p>
      )}
      {note && (
        <p className="mt-4 rounded-control bg-brand-50 px-4 py-3 text-sm font-semibold text-ink">
          {note}
        </p>
      )}

      {candidates.length > 0 && (
        <>
          <h3 className="mt-6 text-lg font-extrabold">{candidates.length} places found</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {candidates.map((c) => (
              <li key={c.place_id} className="rounded-control bg-brand-50 px-4 py-3">
                <p className="font-extrabold">{c.name}</p>
                {c.address && <p className="text-sm text-ink-soft">{c.address}</p>}
                <p className="mt-1 text-sm font-semibold">
                  {distanceLabel(c.distance_m)}
                  {c.rating !== null && ` · ★ ${c.rating.toFixed(1)}`}
                  {c.price_level !== null && ` · ${priceLabel(c.price_level)}`}
                </p>
                {(c.cuisine_tags.length > 0 || c.dietary_unknown) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.cuisine_tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-brand-800"
                      >
                        {optionLabel(t)}
                      </span>
                    ))}
                    {c.dietary_unknown && (
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-ink-soft">
                        Dietary info unknown
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs font-semibold text-ink-soft">
            Place data from Google Maps. Dietary filtering is best-effort, so check with the
            restaurant.
          </p>
        </>
      )}
    </Card>
  );
}
