"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TextInput } from "@/components/ui/TextInput";
import type { ApiErrorResponse, SessionStateResponse } from "@/lib/api-types";
import { cx } from "@/lib/cx";
import { createRealtimeClient } from "@/lib/realtime-client";
import { PreferencesForm } from "./preferences-form";
import { SearchPanel } from "./search-panel";
import { Shortlist } from "./shortlist";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; session: SessionStateResponse };

const JUST_SUBMITTED_MS = 1600;

export function SessionView() {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  // Participants who flipped to submitted a moment ago, for the pop and highlight.
  const [justSubmitted, setJustSubmitted] = useState<ReadonlySet<string>>(new Set());

  const markJustSubmitted = useCallback((id: string) => {
    setJustSubmitted((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setJustSubmitted((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, JUST_SUBMITTED_MS);
  }, []);

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

  // Live submission status. Only the host is given a topic to listen on, and
  // events carry a participant id and nothing else.
  const topic = state.kind === "ready" ? state.session.viewer.realtime_topic : null;
  useEffect(() => {
    if (!topic) return;
    const client = createRealtimeClient();
    if (!client) return;

    const channel = client
      .channel(topic)
      .on("broadcast", { event: "submitted" }, ({ payload }) => {
        const id = (payload as { participant_id?: string }).participant_id;
        if (!id) return;
        markJustSubmitted(id);
        setState((prev) => {
          if (prev.kind !== "ready") return prev;
          const known = prev.session.participants.some((p) => p.id === id);
          if (!known) {
            void load();
            return prev;
          }
          return {
            kind: "ready",
            session: {
              ...prev.session,
              participants: prev.session.participants.map((p) =>
                p.id === id ? { ...p, submitted: true } : p,
              ),
            },
          };
        });
      })
      // Catch up on anything missed before the subscription was live.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void load();
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [topic, load, markJustSubmitted]);

  if (state.kind === "loading") {
    return <p className="animate-pulse text-ink-soft">Loading session…</p>;
  }
  if (state.kind === "error") {
    return (
      <Card className="animate-rise">
        <h1 className="text-2xl font-extrabold">Can’t open this session</h1>
        <p className="mt-2 font-semibold text-danger-700">{state.message}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-control bg-brand-100 px-5 py-3.5 font-bold text-brand-800 transition duration-150 ease-out hover:bg-brand-200 active:scale-95"
        >
          Start a new session
        </Link>
      </Card>
    );
  }

  const { session } = state;
  const joined = session.viewer.participant_id !== null;

  return (
    <div className="flex flex-col gap-section">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-ink-soft">
          Session code
        </p>
        <h1 className="mt-1 font-mono text-4xl font-extrabold tracking-widest text-brand-900">
          {session.join_code}
        </h1>
        {session.viewer.is_host && (
          <span className="mt-3 inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-bold text-brand-800">
            You’re the host
          </span>
        )}
      </header>

      {session.viewer.is_host && <ShareLink code={session.join_code} />}

      {!joined && session.status === "collecting" && (
        <JoinForm code={session.join_code} onJoined={load} />
      )}
      {!joined && session.status !== "collecting" && (
        <Card tone="tint">
          <p className="font-semibold">This session is no longer accepting new people.</p>
        </Card>
      )}

      {joined && session.status === "collecting" && (
        <PreferencesForm
          code={session.join_code}
          initial={session.viewer.preferences}
          onSaved={load}
        />
      )}
      {joined && session.status !== "collecting" && (
        <Card tone="tint">
          <p className="font-semibold">Preferences are locked for this session.</p>
        </Card>
      )}

      {session.shortlist && <Shortlist shortlist={session.shortlist} />}

      {session.viewer.is_host && session.host && session.status === "collecting" && (
        <SearchPanel
          code={session.join_code}
          searchesUsed={session.host.searches_used}
          candidates={session.host.candidates}
          participants={session.participants}
          onSearched={load}
        />
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold">
            Who’s here ({session.participants.length})
          </h2>
          <Button variant="ghost" className="px-3 py-2 text-sm" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
        {session.participants.length === 0 ? (
          <p className="mt-3 text-ink-soft">Nobody has joined yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2.5">
            {session.participants.map((p) => (
              <li
                key={p.id}
                className={cx(
                  "flex items-center gap-3 rounded-control bg-white px-4 py-3 shadow-soft ring-1 ring-line",
                  justSubmitted.has(p.id) && "animate-flash",
                )}
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 font-extrabold text-brand-800"
                >
                  {p.display_name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold">
                  {p.display_name}
                  {p.id === session.viewer.participant_id && (
                    <span className="ml-2 text-sm font-semibold text-ink-soft">(you)</span>
                  )}
                </span>
                {p.submitted !== undefined && (
                  <StatusBadge
                    submitted={p.submitted}
                    justChanged={justSubmitted.has(p.id)}
                  />
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
    <Card tone="tint">
      <h2 className="text-lg font-extrabold">Invite your group</h2>
      <p className="mt-2 break-all rounded-control bg-white px-4 py-3 font-mono text-sm shadow-soft">
        {url}
      </p>
      <Button
        variant="secondary"
        className="mt-4 bg-white hover:bg-brand-100"
        onClick={() => void copy()}
      >
        {copied ? "Copied!" : "Copy link"}
      </Button>
    </Card>
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
    <Card className="animate-rise">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold">Join the table</h2>
        <TextInput
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          autoComplete="nickname"
          placeholder="What should we call you?"
        />
        {error && (
          <p
            role="alert"
            className="animate-rise rounded-control bg-danger-50 px-4 py-3 font-semibold text-danger-700"
          >
            {error}
          </p>
        )}
        <Button type="submit" fullWidth loading={submitting} disabled={name.trim() === ""}>
          {submitting ? "Joining…" : "Join"}
        </Button>
      </form>
    </Card>
  );
}
