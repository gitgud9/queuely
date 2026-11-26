export function formatWait(sec: number): string {
  if (sec <= 0) return "Any moment now";
  const min = Math.ceil(sec / 60);
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  return `~${h} h ${min % 60} min`;
}
