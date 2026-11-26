"use client";

import { useEffect, useRef, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { useBooth, useNow } from "@/lib/client/useBooth";
import { formatWait } from "@/lib/format";
import { called, estimateWaitSec, label, waiting } from "@/lib/queue";

/** Big "Now serving" screen for a TV next to the booth. */
export function Display({ id }: { id: string }) {
  const { booth, error } = useBooth(id);
  const now = useNow(5000);
  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());

  // Flash numbers that were just called (but not on first load).
  useEffect(() => {
    if (!booth) return;
    const current = new Set(called(booth).map((t) => t.number));
    if (seen.current) {
      const added = [...current].filter((n) => !seen.current!.has(n));
      if (added.length) setFresh(new Set(added));
    }
    seen.current = current;
  }, [booth]);

  if (error && !booth) return <main className="container"><div className="banner bad">{error}</div></main>;
  if (!booth) return <main className="container muted">Loading…</main>;

  const serving = called(booth);
  const line = waiting(booth);

  return (
    <main className="display" data-testid="display">
      <section className="stack" style={{ gap: "3vh" }}>
        <div>
          <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 3.5rem)" }}>{booth.name}</h1>
          {booth.paused && <div className="banner warn" style={{ marginTop: 12, fontSize: "1.25rem" }}>Queue paused, back shortly</div>}
        </div>
        <div>
          <div className="muted" style={{ fontSize: "clamp(1rem, 2vw, 1.75rem)", textTransform: "uppercase", letterSpacing: ".1em" }}>Now serving</div>
          <div className="serving" data-testid="display-serving" style={{ marginTop: "1vh" }}>
            {serving.length === 0 && <span className="num" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>—</span>}
            {serving.map((t) => (
              <span key={t.number} className={`num${fresh.has(t.number) ? " fresh" : ""}`}>{label(booth, t.number)}</span>
            ))}
          </div>
        </div>
        <div className="upnext">
          <span className="muted">Up next: </span>
          <span className="mono" data-testid="display-next">
            {line.length
              ? line.slice(0, 5).map((t, i) => (
                  <span key={t.number} style={{ whiteSpace: "nowrap" }}>
                    {i > 0 && "  ·  "}
                    {label(booth, t.number)}
                  </span>
                ))
              : "nobody waiting"}
          </span>
        </div>
      </section>
      <aside className="card stack" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: "2vh" }}>
        <div style={{ fontSize: "clamp(1.25rem, 2.5vw, 2.25rem)", fontWeight: 700 }}>Scan to join the queue</div>
        <QrCode path={`/b/${id}`} size={260} />
        <div className="row" style={{ justifyContent: "space-around", width: "100%" }}>
          <div className="stat"><span className="value">{line.length}</span><span className="label">Waiting</span></div>
          <div className="stat"><span className="value">{formatWait(estimateWaitSec(booth, line.length + 1, now))}</span><span className="label">Est. wait</span></div>
        </div>
      </aside>
    </main>
  );
}
