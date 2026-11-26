"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import type { BoothState } from "../types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;
function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  supabase ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabase;
}

/**
 * Live booth state. Loads once over HTTP, then listens for pushes:
 * Supabase Realtime in production, Server-Sent Events in local/memory mode.
 * A slow background poll and a refetch when the tab becomes visible again
 * cover the gaps (phones love to drop WebSockets when the screen locks).
 */
export function useBooth(id: string) {
  const [booth, setBooth] = useState<BoothState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const versionRef = useRef(-1);

  // Only accept newer versions, so a late HTTP response can't overwrite a fresher push.
  const accept = (s: BoothState) => {
    if (s.version >= versionRef.current) {
      versionRef.current = s.version;
      setBooth(s);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const refetch = async () => {
      try {
        const res = await fetch(`/api/booths/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 404 ? "Booth not found" : "Could not load the queue");
        const s = (await res.json()) as BoothState;
        if (!cancelled) {
          accept(s);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    refetch();

    let unsubscribe: () => void;
    const sb = getSupabase();
    if (sb) {
      const channel = sb
        .channel(`booth:${id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "booths", filter: `id=eq.${id}` }, (payload) => {
          const row = payload.new as { state: BoothState; version: number };
          accept({ ...row.state, version: row.version });
        })
        .subscribe((status) => {
          setLive(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") refetch();
        });
      unsubscribe = () => {
        sb.removeChannel(channel);
      };
    } else {
      const es = new EventSource(`/api/booths/${id}/events`);
      es.onopen = () => setLive(true);
      es.onerror = () => setLive(false);
      es.onmessage = (e) => accept(JSON.parse(e.data));
      unsubscribe = () => es.close();
    }

    const poll = setInterval(refetch, 20000);
    const onVisible = () => document.visibilityState === "visible" && refetch();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [id]);

  return { booth, error, live, setBooth: accept };
}

/** Re-render every `ms` so countdowns stay fresh between updates. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useBoothList() {
  const [booths, setBooths] = useState<BoothState[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/booths", { cache: "no-store" })
        .then((r) => r.json())
        .then((b) => !cancelled && setBooths(b))
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  return booths;
}
