"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ApiErrorResponse, SessionStateResponse } from "@/lib/api-types";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; session: SessionStateResponse };

export function SessionView() {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: (body as ApiErrorResponse).error });
        return;
      }
      setState({ kind: "ready", session: body as SessionStateResponse });
    } catch {
      setState({ kind: "error", message: "Network error. Please try again." });
    }
  }, [code]);

  useEffect(() => {
    // Initial fetch on mount; setState happens after the await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (state.kind === "loading") {
    return <p className="text-neutral-500">Loading session…</p>;
  }
  if (state.kind === "error") {
    return (
      <div>
        <h1 className="text-2xl font-bold">Can’t open this session</h1>
        <p className="mt-2 text-red-600">{state.message}</p>
        <Link href="/" className="mt-6 inline-block underline">
          Start a new session
        </Link>
      </div>
    );
  }

  const { session } = state;
  const joined = session.viewer.participant_id !== null;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-neutral-500">Session</p>
        <h1 className="font-mono text-3xl font-bold">{session.join_code}</h1>
        {session.viewer.is_host && (
          <span className="mt-2 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
            You’re the host
          </span>
        )}
      </header>

      {session.viewer.is_host && <ShareLink code={session.join_code} />}

      {!joined && session.status === "collecting" && (
        <JoinForm code={session.join_code} onJoined={load} />
      )}
      {!joined && session.status !== "collecting" && (
        <p className="text-neutral-600">This session is no longer accepting new people.</p>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            Who’s here ({session.participants.length})
          </h2>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm underline"
          >
            Refresh
          </button>
        </div>
        {session.participants.length === 0 ? (
          <p className="mt-2 text-neutral-500">Nobody has joined yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {session.participants.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
              >
                {p.display_name}
                {p.id === session.viewer.participant_id && (
                  <span className="ml-2 text-sm text-neutral-500">(you)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ShareLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    // window is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(`${window.location.origin}/s/${code}`);
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-lg bg-neutral-100 p-4 dark:bg-neutral-900">
      <h2 className="font-semibold">Invite your group</h2>
      <p className="mt-1 break-all font-mono text-sm">{url}</p>
      <button
        type="button"
        onClick={() => void copy()}
        className="mt-3 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium dark:border-neutral-700"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </section>
  );
}

function JoinForm({ code, onJoined }: { code: string; onJoined: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name }),
      });
      if (!res.ok) {
        const err = (await res.json()) as ApiErrorResponse;
        setError(err.issues?.[0]?.message ?? err.error);
        return;
      }
      await onJoined();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Your name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          autoComplete="nickname"
          className="rounded-lg border border-neutral-300 bg-transparent px-3 py-3 dark:border-neutral-700"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || name.trim() === ""}
        className="rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
      >
        {submitting ? "Joining…" : "Join"}
      </button>
    </form>
  );
}
