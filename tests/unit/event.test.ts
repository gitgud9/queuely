import { describe, expect, it } from "vitest";
import { answer } from "@/lib/assistant";
import { systemPrompt } from "@/lib/assistant/common";
import { quickAnswer } from "@/lib/assistant/quick";
import { getLiveQueues, getSchedule } from "@/lib/assistant/tools";
import { DEFAULT_EVENT } from "@/lib/event/defaults";
import { MemoryEventStore } from "@/lib/event/store";
import type { EventInfo } from "@/lib/event/types";
import { validateEventInfo } from "@/lib/event/validate";
import { MemoryStore } from "@/lib/store/memory";

// 2026-11-26 15:10 in Singapore, 08:10 in London.
const NOW = Date.UTC(2026, 10, 26, 7, 10);

const careerFair: EventInfo = {
  name: "Campus Career Fair",
  date: "Fri 5 Dec, 09:00 to 17:00",
  venue: "Sports Hall",
  timeZone: "Europe/London",
  places: [
    { name: "Robotics Demo", where: "Court 2", boothId: "vr" },
    { name: "Merch tent", where: "Outside the main door" },
  ],
  schedule: [{ start: "08:00", end: "09:00", title: "Breakfast talk", where: "Stage" }],
  faq: ["Bring your CV."],
};

describe("validateEventInfo", () => {
  it("accepts the sample event unchanged", () => {
    expect(validateEventInfo(DEFAULT_EVENT)).toEqual(DEFAULT_EVENT);
  });

  it("trims text, drops empty optional fields and blank FAQ lines, and sorts the programme", () => {
    const r = validateEventInfo({
      ...careerFair,
      name: "  Campus Career Fair ",
      places: [{ name: "Stage", where: "Centre", notes: "", boothId: "" }],
      schedule: [
        { start: "14:00", end: "15:00", title: "B", where: "x" },
        { start: "09:00", end: "10:00", title: "A", where: "x" },
      ],
      faq: ["Bring your CV.", "  ", ""],
    }) as EventInfo;
    expect(r.name).toBe("Campus Career Fair");
    expect(r.places[0]).toEqual({ name: "Stage", where: "Centre" });
    expect(r.schedule.map((s) => s.title)).toEqual(["A", "B"]);
    expect(r.faq).toEqual(["Bring your CV."]);
  });

  it.each([
    [{ name: "" }, /Event name is required/],
    [{ timeZone: "Mars/Olympus" }, /Unknown time zone/],
    [{ schedule: [{ start: "3pm", end: "16:00", title: "x", where: "y" }] }, /24-hour HH:MM/],
    [{ schedule: [{ start: "16:00", end: "15:00", title: "x", where: "y" }] }, /end time must be after/],
    [{ places: [{ name: "x" }] }, /Place 1 location is required/],
    [{ places: "lots" }, /places must be a list/],
    [{ faq: Array.from({ length: 31 }, () => "x") }, /Too many FAQ/],
  ])("rejects bad input %#", (patch, message) => {
    expect(validateEventInfo({ ...careerFair, ...patch })).toMatch(message);
  });
});

describe("MemoryEventStore", () => {
  it("serves the sample until staff save, then the saved event", async () => {
    const store = new MemoryEventStore();
    expect(await store.get()).toMatchObject({ source: "sample", event: DEFAULT_EVENT });
    await store.set(careerFair);
    expect(await store.get()).toMatchObject({ source: "saved", event: careerFair });
  });
});

describe("the assistant uses whatever event staff saved", () => {
  it("puts the event's name, places and FAQ in the AI's instructions", () => {
    const p = systemPrompt(careerFair);
    expect(p).toContain("Campus Career Fair");
    expect(p).toContain("Merch tent: Outside the main door");
    expect(p).toContain("Bring your CV.");
    expect(p).not.toContain("Hall A");
  });

  it("uses the event's time zone and programme for the schedule tool", () => {
    const s = getSchedule(NOW, careerFair);
    expect(s.currentEventTime).toBe("07:10");
    expect(s.nextUp).toBe("Breakfast talk");
  });

  it("uses the event's places for booth locations", async () => {
    const { booths } = await getLiveQueues(new MemoryStore(), NOW, "vr", careerFair);
    expect(booths[0].location).toBe("Court 2");
  });

  it("quick answers find places staff added", async () => {
    const r = await quickAnswer("where is the merch tent?", new MemoryStore(), NOW, careerFair);
    expect(r.reply).toBe("Merch tent: Outside the main door.");
  });

  it("answer() passes the event through to quick answers", async () => {
    const r = await answer([{ role: "user", content: "what's on at 8am" }], { store: new MemoryStore(), env: {}, now: () => NOW, event: careerFair });
    expect(r.reply).toMatch(/Breakfast talk/);
  });
});
