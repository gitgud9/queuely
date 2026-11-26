import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store/memory";
import { join } from "@/lib/queue";

describe("MemoryStore", () => {
  it("seeds the default booths and bumps the version on every write", async () => {
    const store = new MemoryStore();
    const booths = await store.list();
    expect(booths.map((b) => b.id)).toEqual(["vr", "gaming", "photo"]);
    const seen: number[] = [];
    const off = store.subscribe("vr", (s) => seen.push(s.version));
    await store.update("vr", (s) => {
      const r = join(s, Date.now());
      return { state: r.state, result: r.ticket };
    });
    off();
    expect(seen).toEqual([1]);
  });

  it("hands out unique numbers under many simultaneous joins", async () => {
    const store = new MemoryStore();
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        store.update("photo", (s) => {
          const r = join(s, Date.now());
          return { state: r.state, result: r.ticket.number };
        }),
      ),
    );
    const numbers = results.map((r) => r.result);
    expect(new Set(numbers).size).toBe(50);
  });
});
