export function LiveBadge({ live }: { live: boolean }) {
  return <span className={`pill ${live ? "live" : "offline"}`}>{live ? "Live" : "Reconnecting"}</span>;
}
