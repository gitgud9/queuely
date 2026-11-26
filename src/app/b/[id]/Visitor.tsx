"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LiveBadge } from "@/components/LiveBadge";
import { useBooth, useNow } from "@/lib/client/useBooth";
import { formatWait } from "@/lib/format";
import { called, estimateWaitSec, findTicket, label, positionOf, waiting } from "@/lib/queue";

interface Saved {
  number: number;
  joinedAt: number;
  token: string;
}

const key = (id: string) => `queuely:ticket:${id}`;

function loadTicket(id: string): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(key(id)) ?? "null");
  } catch {
    return null;
  }
}

export function Visitor({ id }: { id: string }) {
  const { booth, error, live, setBooth } = useBooth(id);
  const now = useNow(5000);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => setSaved(loadTicket(id)), [id]);

  const save = (t: Saved | null) => {
    if (t) localStorage.setItem(key(id), JSON.stringify(t));
    else localStorage.removeItem(key(id));
    setSaved(t);
  };

  const found = booth && saved ? findTicket(booth, saved.number) : undefined;
  const ticket = found && saved && found.joinedAt === saved.joinedAt ? found : undefined;

  // If staff reset the queue, our old ticket is gone (or its number now
  // belongs to someone who joined later). Forget it.
  useEffect(() => {
    if (booth && saved && !ticket) save(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booth, saved, ticket]);

  // Buzz and flash the tab title when we're called.
  const wasCalled = useRef(false);
  useEffect(() => {
    const isCalled = ticket?.status === "called";
    if (isCalled && !wasCalled.current) {
      navigator.vibrate?.([300, 150, 300, 150, 600]);
      document.title = "🔔 It's your turn!";
    }
    if (!isCalled) document.title = booth ? `${booth.name} · Queuely` : "Queuely";
    wasCalled.current = isCalled;
  }, [ticket?.status, booth]);

  async function joinQueue() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/booths/${id}/join`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setBooth(body.booth);
      save({ number: body.number, joinedAt: body.joinedAt, token: body.token });
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function leaveQueue() {
    if (!saved) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/booths/${id}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saved),
      });
      const body = await res.json();
      if (res.ok) setBooth(body.booth);
      save(null);
    } finally {
      setBusy(false);
    }
  }

  if (error && !booth) {
    return (
      <main className="container narrow stack">
        <div className="banner bad">{error}</div>
        <Link href="/">See all booths</Link>
      </main>
    );
  }
  if (!booth) return <main className="container narrow muted">Loading…</main>;

  const serving = called(booth);
  const line = waiting(booth);
  const position = ticket ? positionOf(booth, ticket.number) : null;

  return (
    <main className="container narrow stack" data-testid="visitor">
      <div className="row spread">
        <div>
          <h1 style={{ fontSize: "1.5rem" }}>{booth.name}</h1>
          <p className="muted small" style={{ margin: "4px 0 0" }}>{booth.description}</p>
        </div>
        <LiveBadge live={live} />
      </div>

      {booth.paused && (
        <div className="banner warn" data-testid="paused-banner">
          This queue is paused for now. {ticket?.status === "waiting" ? "You keep your place." : "Joining will reopen soon."}
        </div>
      )}

      {ticket?.status === "called" && (
        <section className="card your-turn center stack" data-testid="your-turn">
          <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>🔔 It&apos;s your turn!</span>
          <span className="ticket-number" data-testid="my-number">{label(booth, ticket.number)}</span>
          <span>Please head to the {booth.name} now and show this screen.</span>
        </section>
      )}

      {ticket?.status === "waiting" && position !== null && (
        <section className="card center stack" data-testid="my-ticket">
          <span className="muted">Your number</span>
          <span className="ticket-number" data-testid="my-number">{label(booth, ticket.number)}</span>
          <div className="row" style={{ justifyContent: "space-around", marginTop: 8 }}>
            <div className="stat">
              <span className="value" data-testid="my-position">{position === 1 ? "Next" : `#${position}`}</span>
              <span className="label">Place in line</span>
            </div>
            <div className="stat">
              <span className="value" data-testid="my-wait">{formatWait(estimateWaitSec(booth, position, now))}</span>
              <span className="label">Est. wait</span>
            </div>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Keep this page open. It updates by itself and buzzes when it&apos;s your turn.
          </p>
        </section>
      )}

      {(ticket?.status === "served" || ticket?.status === "skipped") && (
        <section className="card center stack" data-testid="finished">
          {ticket.status === "served" ? (
            <span>Thanks for visiting {booth.name}! 🎉</span>
          ) : (
            <span>
              We called <b>{label(booth, ticket.number)}</b> but couldn&apos;t find you. Please speak to a staff member.
            </span>
          )}
          <button className="btn" onClick={() => save(null)}>Get a new ticket</button>
        </section>
      )}

      {!ticket && (
        <section className="card stack" data-testid="join-card">
          <div className="row" style={{ justifyContent: "space-around" }}>
            <div className="stat center">
              <span className="value" data-testid="waiting-count">{line.length}</span>
              <span className="label">Waiting</span>
            </div>
            <div className="stat center">
              <span className="value">{formatWait(estimateWaitSec(booth, line.length + 1, now))}</span>
              <span className="label">Wait if you join</span>
            </div>
          </div>
          <button className="btn primary big" onClick={joinQueue} disabled={busy || booth.paused} data-testid="join">
            {busy ? "Joining…" : "Join the queue"}
          </button>
          {actionError && <div className="banner bad">{actionError}</div>}
        </section>
      )}

      <section className="card soft stack">
        <div className="row spread">
          <span className="muted small">Now serving</span>
          <span className="mono" data-testid="now-serving">
            {serving.length ? serving.map((t) => label(booth, t.number)).join(", ") : "—"}
          </span>
        </div>
        <div className="row spread">
          <span className="muted small">People waiting</span>
          <span className="mono">{line.length}</span>
        </div>
      </section>

      {ticket?.status === "waiting" && (
        <button className="btn danger" onClick={leaveQueue} disabled={busy} data-testid="leave">
          Leave the queue
        </button>
      )}

      <Link href="/" className="small center">See all booths</Link>
    </main>
  );
}
