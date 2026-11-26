"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveBadge } from "@/components/LiveBadge";
import { useBooth, useNow } from "@/lib/client/useBooth";
import { formatWait } from "@/lib/format";
import { called, estimateWaitSec, label, waiting } from "@/lib/queue";
import type { StaffAction } from "@/lib/types";

const PIN_KEY = "queuely:staff-pin";

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Staff({ id, demoPin }: { id: string; demoPin: string | null }) {
  const [pin, setPin] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => setPin(sessionStorage.getItem(PIN_KEY)), []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: input }),
    });
    if (res.ok) {
      sessionStorage.setItem(PIN_KEY, input);
      setPin(input);
    } else setLoginError("Wrong PIN");
  }

  if (!pin) {
    return (
      <main className="container narrow stack">
        <h1>Staff sign-in</h1>
        <form className="card stack" onSubmit={login}>
          <label className="muted small" htmlFor="pin">Staff PIN</label>
          <input id="pin" className="pin" inputMode="numeric" autoFocus value={input} onChange={(e) => setInput(e.target.value)} data-testid="pin" />
          <button className="btn primary" type="submit" data-testid="pin-submit">Sign in</button>
          {loginError && <div className="banner bad">{loginError}</div>}
          {demoPin && <p className="small muted" style={{ margin: 0 }}>Demo mode: the PIN is {demoPin}.</p>}
        </form>
      </main>
    );
  }
  return <Dashboard id={id} pin={pin} demo={!!demoPin} onSignOut={() => { sessionStorage.removeItem(PIN_KEY); setPin(null); }} />;
}

function Dashboard({ id, pin, demo, onSignOut }: { id: string; pin: string; demo: boolean; onSignOut: () => void }) {
  const { booth, error, live, setBooth } = useBooth(id);
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  async function act(action: StaffAction) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/booths/${id}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-staff-pin": pin },
        body: JSON.stringify(action),
      });
      const body = await res.json();
      if (res.status === 401) return onSignOut();
      if (!res.ok) throw new Error(body.error);
      setBooth(body.booth);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Demo helper: fill the line with test visitors so the dashboard has something to do.
  async function addTestVisitors(n: number) {
    setBusy(true);
    try {
      for (let i = 0; i < n; i++) {
        const res = await fetch(`/api/booths/${id}/join`, { method: "POST" });
        if (res.ok) setBooth((await res.json()).booth);
      }
    } finally {
      setBusy(false);
    }
  }

  if (error && !booth) return <main className="container"><div className="banner bad">{error}</div></main>;
  if (!booth) return <main className="container muted">Loading…</main>;

  const serving = called(booth);
  const line = waiting(booth);
  const skipped = booth.tickets.filter((t) => t.status === "skipped").sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  const full = serving.length >= booth.capacity;

  return (
    <main className="container stack" data-testid="staff">
      <div className="row spread">
        <div className="row">
          <h1 style={{ fontSize: "1.6rem" }}>{booth.name}</h1>
          <span className="pill">Staff</span>
          <LiveBadge live={live} />
          {booth.paused && <span className="pill paused" data-testid="staff-paused">Paused</span>}
        </div>
        <div className="row">
          <Link className="btn sm" href={`/display/${id}`} target="_blank">Open public screen</Link>
          <button className="btn sm" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="card stat"><span className="value" data-testid="stat-waiting">{line.length}</span><span className="label">Waiting</span></div>
        <div className="card stat"><span className="value">{serving.length}/{booth.capacity}</span><span className="label">Stations busy</span></div>
        <div className="card stat"><span className="value">{mmss(booth.avgServiceSec * 1000)}</span><span className="label">Avg. per visitor</span></div>
        <div className="card stat"><span className="value">{formatWait(estimateWaitSec(booth, line.length + 1, now))}</span><span className="label">Wait for newcomers</span></div>
        <div className="card stat"><span className="value">{booth.servedCount}</span><span className="label">Served</span></div>
        <div className="card stat"><span className="value">{booth.skippedCount}</span><span className="label">No-shows</span></div>
      </div>

      <button className="btn primary big" disabled={busy || line.length === 0} onClick={() => act({ type: "callNext" })} data-testid="call-next">
        {line.length === 0
          ? "Nobody waiting"
          : `Call ${label(booth, line[0].number)}${full ? ` (finishes ${label(booth, serving[0].number)})` : ""}`}
      </button>
      {actionError && <div className="banner bad">{actionError}</div>}

      <div className="grid">
        <section className="card stack">
          <h2 style={{ fontSize: "1.1rem" }}>Now serving</h2>
          {serving.length === 0 && <p className="muted small" style={{ margin: 0 }}>Nobody yet. Press &quot;Call&quot; above.</p>}
          <ul className="list" data-testid="serving-list">
            {serving.map((t) => (
              <li key={t.number}>
                <span className="mono" style={{ fontWeight: 700, fontSize: "1.1rem" }}>{label(booth, t.number)}</span>
                <span className="mono small muted">{mmss(now - (t.calledAt ?? now))}</span>
                <span className="row" style={{ gap: 6 }}>
                  <button className="btn sm good" disabled={busy} onClick={() => act({ type: "done", number: t.number })}>Done</button>
                  <button className="btn sm danger" disabled={busy} onClick={() => act({ type: "skip", number: t.number })} data-testid={`skip-${t.number}`}>No-show</button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card stack">
          <h2 style={{ fontSize: "1.1rem" }}>Waiting ({line.length})</h2>
          {line.length === 0 && <p className="muted small" style={{ margin: 0 }}>The line is empty.</p>}
          <ul className="list" data-testid="waiting-list">
            {line.slice(0, 50).map((t, i) => (
              <li key={t.number}>
                <span className="mono">{label(booth, t.number)}</span>
                <span className="small muted">waited {mmss(now - t.joinedAt)}</span>
                <span className="small muted">~{formatWait(estimateWaitSec(booth, i + 1, now)).replace("~", "")}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card stack">
          <h2 style={{ fontSize: "1.1rem" }}>Controls</h2>
          <button className="btn" onClick={() => act({ type: booth.paused ? "resume" : "pause" })} disabled={busy} data-testid="pause-toggle">
            {booth.paused ? "Resume queue" : "Pause new joins"}
          </button>
          <p className="small muted" style={{ margin: 0 }}>Pausing stops new people joining. Everyone already in line keeps their place.</p>
          {demo && (
            <button className="btn" onClick={() => addTestVisitors(5)} disabled={busy || booth.paused} data-testid="add-test">
              Add 5 test visitors
            </button>
          )}
          {confirmReset ? (
            <div className="row">
              <button className="btn danger" onClick={() => { setConfirmReset(false); act({ type: "reset" }); }}>Yes, clear everything</button>
              <button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn danger" onClick={() => setConfirmReset(true)}>Reset queue…</button>
          )}
          {skipped.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.95rem", marginTop: 8 }}>Recent no-shows</h3>
              <ul className="list">
                {skipped.slice(0, 5).map((t) => (
                  <li key={t.number}>
                    <span className="mono">{label(booth, t.number)}</span>
                    <button className="btn sm" disabled={busy} onClick={() => act({ type: "recall", number: t.number })}>Turned up, serve now</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
