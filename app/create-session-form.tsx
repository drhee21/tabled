"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ApiErrorResponse } from "@/lib/api-types";

const RADIUS_OPTIONS = [500, 1000, 1500, 3000, 5000];

type MealChoice = "now" | "later";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setError("Your browser does not support location. Enter coordinates below.");
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
        setError("Could not get your location. Enter coordinates below.");
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

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Location</legend>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="rounded-lg border border-neutral-300 px-4 py-3 font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          {locating ? "Locating…" : hasLocation ? "Location set ✓ (update)" : "Use my location"}
        </button>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Latitude
            <input
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Longitude
            <input
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
            />
          </label>
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="font-semibold">Search radius</span>
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="rounded-lg border border-neutral-300 bg-transparent px-3 py-3 dark:border-neutral-700"
        >
          {RADIUS_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r < 1000 ? `${r} m` : `${r / 1000} km`}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Meal time</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="meal"
              checked={mealChoice === "now"}
              onChange={() => setMealChoice("now")}
            />
            Now
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="meal"
              checked={mealChoice === "later"}
              onChange={() => {
                setMealChoice("later");
                if (mealTime === "") {
                  setMealTime(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)));
                }
              }}
            />
            Later
          </label>
        </div>
        {mealChoice === "later" && (
          <input
            type="datetime-local"
            value={mealTime}
            onChange={(e) => setMealTime(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
          />
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create session"}
      </button>
    </form>
  );
}
