"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { createRealtimeClient, isRealtimeConfigured } from "@/lib/realtime-client";

/** "off" means there is nothing to listen to (no topic, or live updates are not configured). */
export type ConnectionStatus = "off" | "connecting" | "live" | "reconnecting";

const MAX_RETRY_DELAY_MS = 15_000;

/**
 * Listen to one broadcast topic and keep the connection alive. When the channel
 * errors or closes it is rebuilt with a growing delay; coming back online or
 * returning to the tab retries at once. Every time the channel is live again
 * `onSubscribed` runs, so the page can catch up on anything it missed.
 *
 * `events` maps an event name to its handler. The set of names must not change
 * while the hook is mounted; the handlers themselves may.
 */
export function useRealtimeChannel(
  topic: string | null,
  events: Record<string, (payload: unknown) => void>,
  onSubscribed: () => void,
): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const latest = useRef({ events, onSubscribed });
  useEffect(() => {
    latest.current = { events, onSubscribed };
  });

  const eventNames = Object.keys(events).sort().join(",");

  useEffect(() => {
    if (!topic || !isRealtimeConfigured()) return;
    const client: SupabaseClient | null = createRealtimeClient();
    if (!client) return;

    let stopped = false;
    let attempt = 0;
    let current: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      if (stopped || !client) return;
      const channel = client.channel(topic as string);
      current = channel;
      for (const event of eventNames.split(",")) {
        channel.on("broadcast", { event }, ({ payload }) => {
          latest.current.events[event]?.(payload);
        });
      }
      channel.subscribe((s) => {
        // Callbacks from a channel we already replaced are stale.
        if (stopped || current !== channel) return;
        if (s === "SUBSCRIBED") {
          attempt = 0;
          setStatus("live");
          latest.current.onSubscribed();
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStatus("reconnecting");
          scheduleRetry();
        }
      });
    }

    function rebuild() {
      if (stopped || !client) return;
      if (timer) clearTimeout(timer);
      timer = undefined;
      const old = current;
      current = null;
      if (old) void client.removeChannel(old);
      connect();
    }

    function scheduleRetry() {
      if (timer || stopped) return;
      const delay = Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
      attempt += 1;
      timer = setTimeout(() => {
        timer = undefined;
        rebuild();
      }, delay);
    }

    function onOnline() {
      setStatus("reconnecting");
      attempt = 0;
      rebuild();
    }
    function onOffline() {
      setStatus("reconnecting");
    }
    function onVisible() {
      // A phone that slept may have missed events: catch up now.
      if (document.visibilityState === "visible") latest.current.onSubscribed();
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      if (current) void client.removeChannel(current);
    };
  }, [topic, eventNames]);

  return topic && isRealtimeConfigured() ? status : "off";
}

/** The worst of several connections, for one status indicator. */
export function combineStatus(statuses: ConnectionStatus[]): ConnectionStatus {
  const active = statuses.filter((s) => s !== "off");
  if (active.length === 0) return "off";
  if (active.includes("reconnecting")) return "reconnecting";
  if (active.includes("connecting")) return "connecting";
  return "live";
}
