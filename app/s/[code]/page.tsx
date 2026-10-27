import { Suspense } from "react";
import { PageLayout } from "@/components/ui/PageLayout";
import { SessionView } from "./session-view";

export default function SessionPage() {
  return (
    <PageLayout>
      <Suspense fallback={<p className="animate-pulse text-ink-soft">Loading session…</p>}>
        <SessionView />
      </Suspense>
    </PageLayout>
  );
}
