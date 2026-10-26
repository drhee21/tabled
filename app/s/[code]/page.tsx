import { Suspense } from "react";
import { SessionView } from "./session-view";

export default function SessionPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-neutral-500">Loading session…</p>}>
        <SessionView />
      </Suspense>
    </main>
  );
}
