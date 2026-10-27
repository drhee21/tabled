import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "./Wordmark";

/** Page shell: wordmark header and a single phone-width column that centers on larger screens. */
export function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(to_bottom,var(--color-brand-50),white_18rem)]">
      <header className="mx-auto w-full max-w-md px-gutter pt-6">
        <Link href="/" aria-label="Tabled home" className="inline-block rounded-control">
          <Wordmark />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-gutter pb-16 pt-section">
        {children}
      </main>
    </div>
  );
}
