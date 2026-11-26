"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = ["Which queue is shortest right now?", "Where is the VR booth?", "What's on at 3pm?", "Where's the nearest toilet?"];

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next = [...turns, { role: "user" as const, content: question }];
    setTurns(next);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-20) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setTurns([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTurns(turns); // drop the unanswered question so it can be resent
      setInput(question);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container narrow stack" style={{ gap: 16, minHeight: "100vh" }}>
      <header className="row spread">
        <div className="stack" style={{ gap: 4 }}>
          <span className="pill live" style={{ alignSelf: "flex-start" }}>Live queue data</span>
          <h1 style={{ fontSize: "1.6rem" }}>Ask the festival assistant</h1>
        </div>
        <Link className="btn sm" href="/">Home</Link>
      </header>

      <section className="stack chat-log" aria-live="polite" data-testid="chat-log">
        {turns.length === 0 && (
          <div className="card soft stack">
            <p style={{ margin: 0 }}>Hi! Ask me about wait times, where things are, or what&apos;s on. I check the live queues for you.</p>
            <div className="row">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="btn sm" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role}`} data-testid={`msg-${t.role}`}>{t.content}</div>
        ))}
        {busy && <div className="bubble assistant muted">Checking…</div>}
        {error && <p className="small" style={{ color: "var(--bad)", margin: 0 }} role="alert">{error}</p>}
        <div ref={endRef} />
      </section>

      <form
        className="row chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          aria-label="Your question"
          placeholder="Ask a question…"
          value={input}
          maxLength={1000}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </main>
  );
}
