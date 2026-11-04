"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

// The search runs these stages in order. The timings are a guide, not a measurement.
const STAGES = [
  { after: 0, text: "Finding open places near you" },
  { after: 4_000, text: "Matching them to what everyone wrote" },
  { after: 9_000, text: "Choosing the top three" },
];

/**
 * Shown while a search runs, which can take several seconds. The host sees their own
 * search; everyone else sees that the host is searching and that this page will update.
 */
export function SearchProgress({ isHost }: { isHost: boolean }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = STAGES.slice(1).map((s, i) => setTimeout(() => setStage(i + 1), s.after));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <Card tone="tint" className="animate-rise">
      <div role="status" aria-live="polite">
        <h2 className="text-xl font-extrabold">
          {isHost ? "Finding your places" : "The host is searching"}
        </h2>
        <p className="mt-2 font-semibold text-brand-900">{STAGES[stage].text}…</p>
      </div>
      <div
        aria-hidden="true"
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white"
      >
        <div className="h-full w-2/5 animate-sweep rounded-full bg-brand-700" />
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        {isHost
          ? "This usually takes a few seconds. Please keep this page open."
          : "Voting opens as soon as the shortlist is ready. This page updates by itself."}
      </p>
    </Card>
  );
}
