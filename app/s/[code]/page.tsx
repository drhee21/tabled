import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLayout } from "@/components/ui/PageLayout";
import { SessionSkeleton } from "@/components/ui/Skeleton";
import { SessionView } from "./session-view";

// The link is what people paste into a chat, so it gets its own preview text.
// The code is never put in the metadata and the page is kept out of search results.
export const metadata: Metadata = {
  title: "Join the table",
  description: "You’re invited to pick a place to eat together. Add your name and share what you’re into.",
  robots: { index: false, follow: false },
  // A page that sets openGraph replaces the site-wide one, so the image and name are repeated here.
  openGraph: {
    type: "website",
    siteName: "Tabled",
    title: "Join me: where should we eat?",
    description: "Add your name, tell us what you’re into, and we’ll vote on a place together.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Tabled: where should we eat?" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Join me: where should we eat?",
    images: ["/opengraph-image"],
  },
};

export default function SessionPage() {
  return (
    <PageLayout>
      <Suspense fallback={<SessionSkeleton />}>
        <SessionView />
      </Suspense>
    </PageLayout>
  );
}
