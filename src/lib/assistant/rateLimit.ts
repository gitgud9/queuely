/**
 * Fixed-window limiter kept in memory: `limit` requests per `windowMs` per key.
 * On Vercel each server instance has its own memory, so this is a soft limit,
 * which is enough to stop one visitor using up the free AI quota.
 */
export class RateLimiter {
  private hits = new Map<string, { start: number; count: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  /** Returns 0 if allowed, otherwise milliseconds until the key may try again. */
  take(key: string, now = Date.now()): number {
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      if (this.hits.size > 5000) this.hits.clear(); // keep memory bounded
      this.hits.set(key, { start: now, count: 1 });
      return 0;
    }
    if (h.count >= this.limit) return h.start + this.windowMs - now;
    h.count++;
    return 0;
  }
}
