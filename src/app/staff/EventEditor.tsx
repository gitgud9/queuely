"use client";

import { useEffect, useState } from "react";
import type { EventInfo, Place, Session } from "@/lib/event/types";

interface Props {
  pin: string;
  booths: { id: string; name: string }[];
  onSignOut: () => void;
}

const emptyPlace: Place = { name: "", where: "", notes: "", boothId: "" };
const emptySession: Session = { start: "", end: "", title: "", where: "" };

/**
 * Staff edit what the AI assistant knows about the event: basics, places,
 * programme and FAQ. Saving replaces the whole event info; the assistant uses
 * it from the next question on. Live queue numbers aren't here: they come from
 * the booths.
 */
export function EventEditor({ pin, booths, onSignOut }: Props) {
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [source, setSource] = useState<"saved" | "sample">("sample");
  const [faqText, setFaqText] = useState("");
  const [status, setStatus] = useState<{ kind: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = (data: { event: EventInfo; source: "saved" | "sample" }) => {
    setEvent(data.event);
    setSource(data.source);
    setFaqText(data.event.faq.join("\n"));
  };

  useEffect(() => {
    fetch("/api/event", { cache: "no-store" })
      .then((r) => r.json())
      .then(load)
      .catch(() => setStatus({ kind: "bad", text: "Couldn't load the event info." }));
  }, []);

  if (!event) return <main className="container muted">{status?.text ?? "Loading…"}</main>;

  const set = <K extends keyof EventInfo>(key: K, value: EventInfo[K]) => {
    setEvent({ ...event, [key]: value });
    setStatus(null);
  };
  const setPlace = (i: number, patch: Partial<Place>) => set("places", event.places.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setSession = (i: number, patch: Partial<Session>) => set("schedule", event.schedule.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/event", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-staff-pin": pin },
        body: JSON.stringify({ ...event, faq: faqText.split("\n") }),
      });
      const body = await res.json();
      if (res.status === 401) return onSignOut();
      if (!res.ok) throw new Error(body.error);
      load(body);
      setStatus({ kind: "good", text: "Saved. The assistant uses this from the next question." });
    } catch (e) {
      setStatus({ kind: "bad", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container stack" data-testid="event-editor">
      <div className="row spread">
        <div className="row">
          <h1 style={{ fontSize: "1.6rem" }}>Event info</h1>
          <span className="pill">{source === "saved" ? "Saved" : "Sample event (not saved yet)"}</span>
        </div>
        <a className="btn sm" href="/assistant" target="_blank" rel="noreferrer">Open the assistant</a>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        This is what the AI assistant tells visitors about the event. Change it for a new event and press Save. Wait times come from the
        live queues, not from here.
      </p>

      <section className="card stack">
        <h2 style={{ fontSize: "1.1rem" }}>Basics</h2>
        <div className="form-grid">
          <label>Event name<input value={event.name} onChange={(e) => set("name", e.target.value)} data-testid="event-name" /></label>
          <label>Date and hours<input value={event.date} onChange={(e) => set("date", e.target.value)} /></label>
          <label>Venue<input value={event.venue} onChange={(e) => set("venue", e.target.value)} /></label>
          <label>Time zone<input value={event.timeZone} onChange={(e) => set("timeZone", e.target.value)} placeholder="Asia/Singapore" /></label>
        </div>
      </section>

      <section className="card stack">
        <div className="row spread">
          <h2 style={{ fontSize: "1.1rem" }}>Places ({event.places.length})</h2>
          <button className="btn sm" onClick={() => set("places", [...event.places, { ...emptyPlace }])} data-testid="add-place">Add place</button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Link a place to a booth so the assistant can give its location with the live wait.</p>
        {event.places.map((p, i) => (
          <div key={i} className="edit-row" data-testid="place-row">
            <input aria-label="Place name" placeholder="Name" value={p.name} onChange={(e) => setPlace(i, { name: e.target.value })} />
            <input aria-label="Where" placeholder="Where (e.g. Hall A, booth A3)" value={p.where} onChange={(e) => setPlace(i, { where: e.target.value })} />
            <input aria-label="Notes" placeholder="Notes (optional)" value={p.notes ?? ""} onChange={(e) => setPlace(i, { notes: e.target.value })} />
            <select aria-label="Booth" value={p.boothId ?? ""} onChange={(e) => setPlace(i, { boothId: e.target.value })}>
              <option value="">No queue</option>
              {booths.map((b) => <option key={b.id} value={b.id}>{b.name} queue</option>)}
            </select>
            <button className="btn sm danger" aria-label={`Remove ${p.name || "place"}`} onClick={() => set("places", event.places.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
      </section>

      <section className="card stack">
        <div className="row spread">
          <h2 style={{ fontSize: "1.1rem" }}>Programme ({event.schedule.length})</h2>
          <button className="btn sm" onClick={() => set("schedule", [...event.schedule, { ...emptySession }])} data-testid="add-session">Add session</button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Times are in the event&apos;s time zone. Sessions are sorted by start time when you save.</p>
        {event.schedule.map((s, i) => (
          <div key={i} className="edit-row schedule" data-testid="session-row">
            <input aria-label="Start" type="time" value={s.start} onChange={(e) => setSession(i, { start: e.target.value })} />
            <input aria-label="End" type="time" value={s.end} onChange={(e) => setSession(i, { end: e.target.value })} />
            <input aria-label="Title" placeholder="What's on" value={s.title} onChange={(e) => setSession(i, { title: e.target.value })} />
            <input aria-label="Session place" placeholder="Where" value={s.where} onChange={(e) => setSession(i, { where: e.target.value })} />
            <button className="btn sm danger" aria-label={`Remove ${s.title || "session"}`} onClick={() => set("schedule", event.schedule.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: "1.1rem" }}>FAQ</h2>
        <p className="muted small" style={{ margin: 0 }}>One fact per line, for example &quot;Entry is free.&quot;</p>
        <textarea aria-label="FAQ" rows={6} value={faqText} onChange={(e) => { setFaqText(e.target.value); setStatus(null); }} />
      </section>

      <div className="row save-bar">
        <button className="btn primary" onClick={save} disabled={busy} data-testid="save-event">{busy ? "Saving…" : "Save event info"}</button>
        {status && <div className={`banner ${status.kind}`} role="status" data-testid="event-status">{status.text}</div>}
      </div>
    </main>
  );
}
