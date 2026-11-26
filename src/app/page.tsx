"use client";

import Link from "next/link";
import { QrCode } from "@/components/QrCode";
import { useBoothList } from "@/lib/client/useBooth";
import { formatWait } from "@/lib/format";
import { called, estimateWaitSec, label, waiting } from "@/lib/queue";

export default function Home() {
  const booths = useBoothList();
  const now = Date.now();
  return (
    <main className="container stack" style={{ gap: 24 }}>
      <header className="stack" style={{ gap: 8 }}>
        <span className="pill" style={{ alignSelf: "flex-start" }}>Queue Portal</span>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>Basic Queue systems for 3 different portals</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 640 }}>
          Scan a booth&apos;s QR code to join its queue. Your number, place in line and estimated wait update live on your
          phone, and it buzzes when it&apos;s your turn. Staff call the next visitor from a dashboard, and a big screen at the
          booth shows who&apos;s being served.
        </p>
        <div className="row">
          <Link className="btn primary" href="/demo/vr">Try the live demo</Link>
          <a className="btn" href={process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/gitgud9/queuely"} target="_blank" rel="noreferrer">How it&apos;s built</a>
        </div>
      </header>

      <section className="grid">
        {!booths && <p className="muted">Loading booths…</p>}
        {booths?.map((b) => {
          const line = waiting(b);
          const serving = called(b);
          return (
            <article key={b.id} className="card stack" data-testid={`booth-${b.id}`}>
              <div className="row spread">
                <h2 style={{ fontSize: "1.25rem" }}>{b.name}</h2>
                {b.paused ? <span className="pill paused">Paused</span> : <span className="pill live">Open</span>}
              </div>
              <p className="muted small" style={{ margin: 0 }}>{b.description}</p>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="stat"><span className="value">{line.length}</span><span className="label">Waiting</span></div>
                <div className="stat"><span className="value">{formatWait(estimateWaitSec(b, line.length + 1, now))}</span><span className="label">Wait</span></div>
                <div className="stat"><span className="value mono" style={{ fontSize: "1.1rem" }}>{serving[0] ? label(b, serving[0].number) : "—"}</span><span className="label">Serving</span></div>
              </div>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <QrCode path={`/b/${b.id}`} size={120} />
                <div className="stack" style={{ flex: 1, gap: 8 }}>
                  <Link className="btn primary sm" href={`/b/${b.id}`}>Join queue</Link>
                  <Link className="btn sm" href={`/staff/${b.id}`}>Staff dashboard</Link>
                  <Link className="btn sm" href={`/display/${b.id}`}>Public screen</Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
