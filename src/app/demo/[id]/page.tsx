import Link from "next/link";
import { DEFAULT_BOOTHS } from "@/lib/booths";

/** All three views side by side, so one person can try the whole flow on a laptop. */
export default async function Demo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <div className="row spread" style={{ padding: "12px 16px" }}>
        <div className="row">
          <Link href="/" style={{ fontWeight: 700 }}>Queuely</Link>
          <span className="muted small">Live demo: join on the left, call visitors from the staff dashboard{process.env.STAFF_PIN ? "" : " (PIN 1234)"}.</span>
        </div>
        <div className="row">
          {DEFAULT_BOOTHS.map((b) => (
            <Link key={b.id} className={`btn sm${b.id === id ? " primary" : ""}`} href={`/demo/${b.id}`}>{b.name}</Link>
          ))}
        </div>
      </div>
      <div className="demo">
        <iframe className="visitor" src={`/b/${id}`} title="Visitor phone" />
        <iframe src={`/staff/${id}`} title="Staff dashboard" />
        <iframe src={`/display/${id}`} title="Public screen" />
      </div>
    </>
  );
}
