"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SuccessCheck } from "@/components/ui/SuccessCheck";
import { TextArea } from "@/components/ui/TextInput";
import type { ApiErrorResponse, OwnPreferences } from "@/lib/api-types";
import {
  CUISINE_VALUES,
  DIETARY_VALUES,
  NOTE_MAX_LENGTH,
  optionLabel,
} from "@/lib/preference-options";

// "" means no limit; the rest are price levels 1 to 4.
const BUDGET_OPTIONS = [
  { value: "", label: "Any" },
  { value: "1", label: "$" },
  { value: "2", label: "$$" },
  { value: "3", label: "$$$" },
  { value: "4", label: "$$$$" },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function budgetToString(level: number | null): string {
  return level === null ? "" : String(level);
}

function budgetFromString(value: string): number | null {
  return value === "" ? null : Number(value);
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
    <Card className="animate-rise">
      <form onSubmit={onSubmit} className="flex flex-col gap-8" onChange={edited}>
        <div>
          <h2 className="text-2xl font-extrabold">
            {resubmitting ? "Update your answers" : "What are you into?"}
          </h2>
          <p className="mt-1 text-ink-soft">
            Only the host sees that you have answered. Nobody else sees what you picked.
          </p>
        </div>

        <Section title="Dietary restrictions" hint="Best-effort only. Check with the restaurant before you go.">
          {DIETARY_VALUES.map((v) => (
            <Chip
              key={v}
              checked={dietary.includes(v)}
              onChange={() => setDietary((d) => toggle(d, v))}
            >
              {optionLabel(v)}
            </Chip>
          ))}
        </Section>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-lg font-extrabold">Budget</legend>
          <SegmentedControl
            label="Spend at least"
            options={BUDGET_OPTIONS}
            value={budgetToString(budgetMin)}
            onChange={(v) => setBudgetMin(budgetFromString(v))}
          />
          <SegmentedControl
            label="Spend at most"
            options={BUDGET_OPTIONS}
            value={budgetToString(budgetMax)}
            onChange={(v) => setBudgetMax(budgetFromString(v))}
          />
        </fieldset>

        <Section title="Cuisines you want">
          {CUISINE_VALUES.map((v) => (
            <Chip
              key={v}
              checked={want.includes(v)}
              onChange={() => {
                setWant((w) => toggle(w, v));
                setAvoid((a) => a.filter((c) => c !== v));
              }}
            >
              {optionLabel(v)}
            </Chip>
          ))}
        </Section>

        <Section title="Cuisines you don’t want">
          {CUISINE_VALUES.map((v) => (
            <Chip
              key={v}
              tone="avoid"
              checked={avoid.includes(v)}
              onChange={() => {
                setAvoid((a) => toggle(a, v));
                setWant((w) => w.filter((c) => c !== v));
              }}
            >
              {optionLabel(v)}
            </Chip>
          ))}
        </Section>

        <TextArea
          label={
            <>
              Note <span className="font-normal text-ink-soft">(optional)</span>
            </>
          }
          hint={`${note.length}/${NOTE_MAX_LENGTH}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX_LENGTH}
          rows={3}
          placeholder="Anything the group should know?"
        />

        {error && (
          <p
            role="alert"
            className="animate-rise rounded-control bg-danger-50 px-4 py-3 font-semibold text-danger-700"
          >
            {error}
          </p>
        )}

        {saved && (
          <div
            role="status"
            className="flex animate-rise items-center gap-4 rounded-control bg-success-50 px-4 py-3"
          >
            <SuccessCheck />
            <div>
              <p className="font-extrabold text-success-700">You’re in!</p>
              <p className="text-sm text-ink-soft">
                You can change your answers until the host starts the search.
              </p>
            </div>
          </div>
        )}

        <Button type="submit" fullWidth loading={submitting}>
          {submitting ? "Saving…" : resubmitting ? "Update answers" : "Submit"}
        </Button>
      </form>
    </Card>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-lg font-extrabold">{title}</legend>
      <div className="flex flex-wrap gap-2.5">{children}</div>
      {hint && <p className="text-sm text-ink-soft">{hint}</p>}
    </fieldset>
  );
}
