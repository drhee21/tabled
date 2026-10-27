"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SuccessCheck } from "@/components/ui/SuccessCheck";
import { TextInput } from "@/components/ui/TextInput";
import type { ApiErrorResponse } from "@/lib/api-types";

const RADIUS_OPTIONS = [
  { value: "500", label: "0.5" },
  { value: "1000", label: "1" },
  { value: "1500", label: "1.5" },
  { value: "3000", label: "3" },
  { value: "5000", label: "5" },
];

const MEAL_OPTIONS = [
  { value: "now", label: "Now" },
  { value: "later", label: "Later" },
];

type MealChoice = "now" | "later";

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateSessionForm() {
  const router = useRouter();
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState(1500);
  const [mealChoice, setMealChoice] = useState<MealChoice>("now");
  // Filled in when "Later" is picked, so the page can prerender without a clock read.
  const [mealTime, setMealTime] = useState("");
  const [locating, setLocating] = useState(false);
  // Raw coordinates are a fallback; they open by themselves if location fails.
  const [showManual, setShowManual] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setError("Your browser does not support location. You can enter coordinates instead.");
      setShowManual(true);
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
        setLocating(false);
      },
      () => {
        setError("Could not get your location. You can enter coordinates instead.");
        setShowManual(true);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (lat === "" || lng === "" || Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      setError("Set a location first.");
      return;
    }
    const meal = mealChoice === "now" ? new Date() : new Date(mealTime);
    if (Number.isNaN(meal.getTime())) {
      setError("Pick a valid meal time.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: latNum,
          lng: lngNum,
          radius_m: radius,
          meal_time: meal.toISOString(),
        }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        const err = body as ApiErrorResponse;
        setError(err.issues?.[0]?.message ?? err.error);
        return;
      }
      const { join_code } = body as { join_code: string };
      router.push(`/s/${join_code}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }


  const hasLocation = lat !== "" && lng !== "";

  function chooseMeal(value: string) {
    const choice = value as MealChoice;
    setMealChoice(choice);
    if (choice === "later" && mealTime === "") {
      setMealTime(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)));
    }
  }

  return (
    <Card className="mt-8 animate-rise">
      <form onSubmit={onSubmit} className="flex flex-col gap-8">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-lg font-extrabold">Where are you?</legend>
          {hasLocation && !locating ? (
            <div className="flex animate-rise items-center gap-3 rounded-control bg-success-50 px-4 py-3">
              <SuccessCheck size={32} />
              <p className="flex-1 font-extrabold text-success-700">Location set</p>
              <Button variant="ghost" className="px-3 py-2 text-sm" onClick={useMyLocation}>
                Update
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              fullWidth
              onClick={useMyLocation}
              loading={locating}
            >
              {!locating && <PinIcon />}
              {locating ? "Locating…" : "Use my location"}
            </Button>
          )}
          <Button
            variant="ghost"
            className="self-start px-3 py-2 text-sm"
            aria-expanded={showManual}
            onClick={() => setShowManual((s) => !s)}
          >
            {showManual ? "Hide coordinates" : "Enter coordinates instead"}
          </Button>
          {showManual && (
            <div className="grid animate-rise grid-cols-2 gap-3">
              <TextInput
                label="Latitude"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
              <TextInput
                label="Longitude"
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </div>
          )}
        </fieldset>

        <SegmentedControl
          label="How far will you go? (km)"
          options={RADIUS_OPTIONS}
          value={String(radius)}
          onChange={(v) => setRadius(Number(v))}
        />

        <div className="flex flex-col gap-4">
          <SegmentedControl
            label="When are you eating?"
            options={MEAL_OPTIONS}
            value={mealChoice}
            onChange={chooseMeal}
          />
          {mealChoice === "later" && (
            <TextInput
              type="datetime-local"
              aria-label="Meal time"
              value={mealTime}
              onChange={(e) => setMealTime(e.target.value)}
            />
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="animate-rise rounded-control bg-danger-50 px-4 py-3 font-semibold text-danger-700"
          >
            {error}
          </p>
        )}

        <Button type="submit" fullWidth loading={submitting}>
          {submitting ? "Creating…" : "Create session"}
        </Button>
      </form>
    </Card>
  );
}
