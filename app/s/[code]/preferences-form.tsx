"use client";

import { useState, type FormEvent } from "react";
import type { ApiErrorResponse, OwnPreferences } from "@/lib/api-types";
import {
  CUISINE_VALUES,
  DIETARY_VALUES,
  NOTE_MAX_LENGTH,
  optionLabel,
} from "@/lib/preference-options";

const PRICE_OPTIONS = [1, 2, 3, 4];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function priceSelectValue(level: number | null): string {
  return level === null ? "" : String(level);
}

export function PreferencesForm({
  code,
  initial,
  onSaved,
}: {
  code: string;
  initial: OwnPreferences | null;
  onSaved: () => Promise<void>;
}) {
  const [dietary, setDietary] = useState(initial?.dietary ?? []);
  const [budgetMin, setBudgetMin] = useState<number | null>(initial?.budget_min ?? null);
  const [budgetMax, setBudgetMax] = useState<number | null>(initial?.budget_max ?? null);
  const [want, setWant] = useState(initial?.cuisines_want ?? []);
  const [avoid, setAvoid] = useState(initial?.cuisines_avoid ?? []);
  const [note, setNote] = useState(initial?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const resubmitting = initial !== null;

  function edited() {
    setSaved(false);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dietary,
          budget_min: budgetMin,
          budget_max: budgetMax,
          cuisines_want: want,
          cuisines_avoid: avoid,
          note,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as ApiErrorResponse;
        setError(err.issues?.[0]?.message ?? err.error);
        return;
      }
      setSaved(true);
      await onSaved();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" onChange={edited}>
      <div>
        <h2 className="text-xl font-bold">
          {resubmitting ? "Update your answers" : "Your preferences"}
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Only the host sees that you have answered. Nobody else sees what you picked.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Dietary restrictions</legend>
        <ChipGroup
          values={DIETARY_VALUES}
          selected={dietary}
          onToggle={(v) => setDietary((d) => toggle(d, v))}
        />
        <p className="text-xs text-neutral-500">
          Best-effort only. Check with the restaurant before you go.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Budget</legend>
        <div className="grid grid-cols-2 gap-3">
          <PriceSelect
            label="From"
            value={budgetMin}
            onChange={setBudgetMin}
          />
          <PriceSelect label="Up to" value={budgetMax} onChange={setBudgetMax} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Cuisines you want</legend>
        <ChipGroup
          values={CUISINE_VALUES}
          selected={want}
          onToggle={(v) => {
            setWant((w) => toggle(w, v));
            setAvoid((a) => a.filter((c) => c !== v));
          }}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Cuisines you refuse</legend>
        <ChipGroup
          values={CUISINE_VALUES}
          selected={avoid}
          onToggle={(v) => {
            setAvoid((a) => toggle(a, v));
            setWant((w) => w.filter((c) => c !== v));
          }}
        />
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="font-semibold">
          Note <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX_LENGTH}
          rows={3}
          className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
        />
        <span className="text-xs text-neutral-500">
          {note.length}/{NOTE_MAX_LENGTH}
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Saved. You can change your answers until the host starts the search.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
      >
        {submitting ? "Saving…" : resubmitting ? "Update answers" : "Submit"}
      </button>
    </form>
  );
}

function ChipGroup<T extends string>({
  values,
  selected,
  onToggle,
}: {
  values: readonly T[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => {
        const on = selected.includes(v);
        return (
          <label
            key={v}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
              on
                ? "border-orange-600 bg-orange-600 text-white"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggle(v)}
              className="sr-only"
            />
            {optionLabel(v)}
          </label>
        );
      })}
    </div>
  );
}

function PriceSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select
        value={priceSelectValue(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="rounded-lg border border-neutral-300 bg-transparent px-3 py-3 dark:border-neutral-700"
      >
        <option value="">Any</option>
        {PRICE_OPTIONS.map((p) => (
          <option key={p} value={p}>
            {"$".repeat(p)}
          </option>
        ))}
      </select>
    </label>
  );
}
