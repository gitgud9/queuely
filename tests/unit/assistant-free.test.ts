import { describe, expect, it } from "vitest";
import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { BUSY_NOTE, OFFLINE_NOTE, answer, pickProvider } from "@/lib/assistant";
import { runGemini, type GenerateContent } from "@/lib/assistant/gemini";
import { parseTime, quickAnswer } from "@/lib/assistant/quick";
import { RateLimiter } from "@/lib/assistant/rateLimit";
import { applyStaffAction, join } from "@/lib/queue";
import { MemoryStore } from "@/lib/store/memory";

// 2026-11-26 15:10 in Singapore (UTC+8).
const NOW = Date.UTC(2026, 10, 26, 7, 10);

async function storeWithLines(lines: Record<string, number>) {
  const store = new MemoryStore();
  for (const [id, n] of Object.entries(lines)) {
    for (let i = 0; i < n; i++) await store.update(id, (s) => ({ state: join(s, NOW).state, result: null }));
  }
  return store;
}

/** Shape of a Gemini response: the SDK exposes functionCalls/text as getters. */
const gem = (r: { calls?: { id?: string; name: string; args?: object }[]; text?: string }) =>
  ({
    functionCalls: r.calls,
    text: r.text,
    candidates: [{ content: { role: "model", parts: r.calls ? r.calls.map((c) => ({ functionCall: c })) : [{ text: r.text }] } }],
  }) as unknown as GenerateContentResponse;

function fakeGemini(script: GenerateContentResponse[]) {
  const calls: GenerateContentParameters[] = [];
  const generate: GenerateContent = async (p) => {
    calls.push(structuredClone(p));
    const next = script.shift();
    if (!next) throw new Error("fake ran out of responses");
    return next;
  };
  return { generate, calls };
}

describe("runGemini (Gemini tool-use loop)", () => {
  it("runs the live queue tool and sends the result back as a functionResponse", async () => {
    const store = await storeWithLines({ vr: 3 });
    const g = fakeGemini([gem({ calls: [{ id: "c1", name: "get_live_queues", args: {} }] }), gem({ text: "Photo Booth, any moment now." })]);
    const r = await runGemini([{ role: "user", content: "shortest?" }], { generate: g.generate, store, now: () => NOW });

    expect(r).toEqual({ reply: "Photo Booth, any moment now.", toolsUsed: ["get_live_queues"], source: "gemini" });
    expect(g.calls[0].model).toBe("gemini-flash-latest");
    const contents = g.calls[1].contents as { role: string; parts: { functionResponse?: { id: string; name: string; response: { output: { booths: { id: string; waiting: number }[] } } } }[] }[];
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    const fr = contents[2].parts[0].functionResponse!;
    expect(fr).toMatchObject({ id: "c1", name: "get_live_queues" });
    expect(fr.response.output.booths.find((b) => b.id === "vr")!.waiting).toBe(3);
  });

  it("maps chat history to Gemini roles and reports tool errors back to the model", async () => {
    const g = fakeGemini([gem({ calls: [{ name: "nope" }] }), gem({ text: "Sorry!" })]);
    await runGemini(
      [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
      { generate: g.generate, store: new MemoryStore(), now: () => NOW },
    );
    const contents = g.calls[1].contents as { role: string; parts: { functionResponse?: { response: { error?: string } } }[] }[];
    expect(contents.slice(0, 3).map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(contents.at(-1)!.parts[0].functionResponse!.response.error).toMatch(/Unknown tool/);
  });
});

describe("quickAnswer (no AI)", () => {
  it("names the shortest open queue from live data", async () => {
    const store = await storeWithLines({ vr: 6, gaming: 9, photo: 3 });
    const r = await quickAnswer("Which queue is shortest right now?", store, NOW);
    expect(r.source).toBe("quick");
    expect(r.reply).toMatch(/^Photo Booth has the shortest wait/);
    expect(r.reply).toMatch(/Hall B entrance/);
  });

  it("answers about one booth, including when it is paused", async () => {
    const store = await storeWithLines({ vr: 2 });
    expect((await quickAnswer("how long is the VR line", store, NOW)).reply).toMatch(/^VR Experience: 2 waiting/);
    await store.update("gaming", (s) => ({ state: applyStaffAction(s, { type: "pause" }, NOW), result: null }));
    expect((await quickAnswer("gaming wait?", store, NOW)).reply).toMatch(/paused/);
  });

  it("answers where things are", async () => {
    const store = new MemoryStore();
    expect((await quickAnswer("Where is the VR booth?", store, NOW)).reply).toMatch(/^VR Experience: Hall A, booth A3/);
    expect((await quickAnswer("where's the nearest toilet", store, NOW)).reply).toMatch(/^Toilets: Behind the food court/);
    expect((await quickAnswer("where is the car park", store, NOW)).reply).toMatch(/info counter/);
  });

  it("answers what's on at a time, and now", async () => {
    const store = new MemoryStore();
    expect((await quickAnswer("What's on at 3pm?", store, NOW)).reply).toMatch(/Gaming tournament: finals.*VR speed challenge/);
    expect((await quickAnswer("anything at 9am", store, NOW)).reply).toMatch(/Nothing is scheduled at 09:00. Next up is Opening ceremony/);
    expect((await quickAnswer("what's happening now", store, NOW)).reply).toMatch(/^It's 15:10 now\. On now:/);
  });

  it("parses times", () => {
    expect(parseTime("at 3pm")).toBe("15:00");
    expect(parseTime("3:30 pm")).toBe("15:30");
    expect(parseTime("12am")).toBe("00:00");
    expect(parseTime("at 14:45")).toBe("14:45");
    expect(parseTime("booth 3")).toBeNull();
  });

  it("offers help for anything else", async () => {
    expect((await quickAnswer("write my essay", new MemoryStore(), NOW)).reply).toMatch(/only answer simple questions/);
  });
});

describe("answer (provider choice and fallback)", () => {
  const q = [{ role: "user" as const, content: "Which queue is shortest?" }];

  it("prefers the free Gemini key, then Claude, then quick answers", () => {
    expect(pickProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" })).toBe("gemini");
    expect(pickProvider({ ANTHROPIC_API_KEY: "a" })).toBe("claude");
    expect(pickProvider({})).toBe("quick");
  });

  it("uses quick answers when no key is set", async () => {
    const r = await answer(q, { store: new MemoryStore(), env: {}, now: () => NOW });
    expect(r).toMatchObject({ source: "quick", note: OFFLINE_NOTE });
  });

  it("falls back to quick answers when the AI is rate limited", async () => {
    const { ApiError } = await import("@google/genai");
    const r = await answer(q, {
      store: new MemoryStore(),
      env: { GEMINI_API_KEY: "g" },
      now: () => NOW,
      run: async () => {
        throw new ApiError({ message: "quota", status: 429 });
      },
    });
    expect(r).toMatchObject({ source: "quick", note: BUSY_NOTE });
    expect(r.reply).toMatch(/shortest wait/);
  });

  it("returns the AI's answer when it works", async () => {
    const r = await answer(q, { store: new MemoryStore(), env: { GEMINI_API_KEY: "g" }, run: async () => ({ reply: "hi", toolsUsed: [], source: "gemini" }) });
    expect(r).toEqual({ reply: "hi", toolsUsed: [], source: "gemini" });
  });
});

describe("RateLimiter", () => {
  it("allows a few requests per window per visitor", () => {
    const rl = new RateLimiter(2, 60_000);
    expect(rl.take("a", 0)).toBe(0);
    expect(rl.take("a", 1000)).toBe(0);
    expect(rl.take("a", 2000)).toBe(58_000);
    expect(rl.take("b", 2000)).toBe(0);
    expect(rl.take("a", 60_000)).toBe(0);
  });
});
