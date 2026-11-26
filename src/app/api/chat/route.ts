import { json } from "@/lib/api";
import { parseHistory } from "@/lib/assistant/common";
import { answer } from "@/lib/assistant";
import { RateLimiter } from "@/lib/assistant/rateLimit";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Protects the free AI quota: each visitor gets a few questions a minute.
const limiter = new RateLimiter(8, 60_000);

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const wait = limiter.take(ip);
  if (wait > 0) return json({ error: `You're asking very fast. Try again in ${Math.ceil(wait / 1000)} seconds.` }, 429);

  const history = parseHistory(await req.json().catch(() => null));
  if (typeof history === "string") return json({ error: history }, 400);
  return json(await answer(history, { store: getStore() }));
}
