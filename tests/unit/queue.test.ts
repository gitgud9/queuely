import { describe, expect, it } from "vitest";
import {
  applyStaffAction,
  callNext,
  called,
  createBooth,
  estimateWaitSec,
  HISTORY_LIMIT,
  join,
  label,
  leave,
  positionOf,
  QueueError,
  updateAverage,
  waiting,
} from "@/lib/queue";
import type { BoothState } from "@/lib/types";

const T0 = 1_700_000_000_000;
const sec = (n: number) => n * 1000;

function booth(capacity = 1, defaultServiceSec = 60): BoothState {
  return createBooth({ id: "vr", name: "VR", prefix: "VR", description: "", capacity, defaultServiceSec });
}

function joinMany(s: BoothState, n: number, now = T0) {
  for (let i = 0; i < n; i++) s = join(s, now + i).state;
  return s;
}

describe("joining and leaving", () => {
  it("hands out increasing ticket numbers", () => {
    let s = booth();
    const a = join(s, T0);
    const b = join(a.state, T0 + 1);
    expect(a.ticket.number).toBe(1);
    expect(b.ticket.number).toBe(2);
    s = b.state;
    expect(positionOf(s, 1)).toBe(1);
    expect(positionOf(s, 2)).toBe(2);
  });

  it("refuses to join a paused queue", () => {
    const s = applyStaffAction(booth(), { type: "pause" }, T0);
    expect(() => join(s, T0)).toThrow(QueueError);
  });

  it("moves people up when someone leaves, and never reuses a number", () => {
    let s = joinMany(booth(), 3);
    s = leave(s, 1, T0);
    expect(positionOf(s, 2)).toBe(1);
    expect(positionOf(s, 1)).toBeNull();
    expect(join(s, T0).ticket.number).toBe(4);
  });

  it("cannot leave twice", () => {
    const s = leave(joinMany(booth(), 1), 1, T0);
    expect(() => leave(s, 1, T0)).toThrow(QueueError);
  });

  it("formats labels with the booth prefix", () => {
    expect(label({ prefix: "VR" }, 7)).toBe("VR-007");
  });
});

describe("calling visitors", () => {
  it("calls people in the order they joined", () => {
    let s = joinMany(booth(), 3);
    s = callNext(s, T0 + sec(10));
    expect(called(s).map((t) => t.number)).toEqual([1]);
    expect(waiting(s).map((t) => t.number)).toEqual([2, 3]);
  });

  it("on a one-person booth, calling next finishes the current visitor", () => {
    let s = joinMany(booth(1), 2);
    s = callNext(s, T0);
    s = callNext(s, T0 + sec(60));
    expect(s.tickets.find((t) => t.number === 1)?.status).toBe("served");
    expect(called(s).map((t) => t.number)).toEqual([2]);
    expect(s.servedCount).toBe(1);
  });

  it("fills every slot before finishing anyone on a multi-person booth", () => {
    let s = joinMany(booth(2), 3);
    s = callNext(s, T0);
    s = callNext(s, T0 + 1);
    expect(called(s)).toHaveLength(2);
    s = callNext(s, T0 + sec(60)); // full: oldest (ticket 1) is finished
    expect(called(s).map((t) => t.number)).toEqual([2, 3]);
  });

  it("errors when nobody is waiting", () => {
    expect(() => callNext(booth(), T0)).toThrow(/Nobody is waiting/);
  });

  it("skips a no-show and can recall them if they turn up", () => {
    let s = joinMany(booth(), 2);
    s = applyStaffAction(s, { type: "callNext" }, T0);
    s = applyStaffAction(s, { type: "skip", number: 1 }, T0 + sec(30));
    expect(s.skippedCount).toBe(1);
    expect(called(s)).toHaveLength(0);
    s = applyStaffAction(s, { type: "recall", number: 1 }, T0 + sec(40));
    expect(called(s).map((t) => t.number)).toEqual([1]);
    expect(s.skippedCount).toBe(0);
  });

  it("a skipped no-show does not count towards the average service time", () => {
    let s = joinMany(booth(1, 60), 1);
    s = applyStaffAction(s, { type: "callNext" }, T0);
    s = applyStaffAction(s, { type: "skip", number: 1 }, T0 + sec(5));
    expect(s.avgServiceSec).toBe(60);
  });

  it("marks a visitor done explicitly", () => {
    let s = joinMany(booth(2), 1);
    s = applyStaffAction(s, { type: "callNext" }, T0);
    s = applyStaffAction(s, { type: "done", number: 1 }, T0 + sec(60));
    expect(s.tickets[0].status).toBe("served");
    expect(() => applyStaffAction(s, { type: "done", number: 1 }, T0)).toThrow(QueueError);
  });

  it("reset clears tickets but keeps the booth settings", () => {
    let s = joinMany(booth(3, 90), 5);
    s = applyStaffAction(s, { type: "reset" }, T0);
    expect(s.tickets).toHaveLength(0);
    expect(s.nextNumber).toBe(1);
    expect(s.capacity).toBe(3);
  });

  it("keeps only a short history of finished tickets", () => {
    let s = joinMany(booth(1), HISTORY_LIMIT + 10);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) s = applyStaffAction(s, { type: "callNext" }, T0 + sec(60 * (i + 1)));
    const finished = s.tickets.filter((t) => t.status === "served");
    expect(finished).toHaveLength(HISTORY_LIMIT);
    expect(waiting(s)).toHaveLength(5);
  });
});

describe("wait time estimates", () => {
  it("is zero when a slot is free", () => {
    const s = joinMany(booth(2, 60), 1);
    expect(estimateWaitSec(s, 1, T0)).toBe(0);
  });

  it("grows with your position on a one-person booth", () => {
    let s = joinMany(booth(1, 60), 4);
    s = callNext(s, T0); // ticket 1 is being served, 2-4 waiting
    expect(estimateWaitSec(s, 1, T0)).toBe(60);
    expect(estimateWaitSec(s, 2, T0)).toBe(120);
    expect(estimateWaitSec(s, 3, T0)).toBe(180);
  });

  it("goes down as the current visitor's time runs on", () => {
    let s = joinMany(booth(1, 60), 2);
    s = callNext(s, T0);
    expect(estimateWaitSec(s, 1, T0 + sec(45))).toBe(15);
    // never negative, even if the visitor overstays
    expect(estimateWaitSec(s, 1, T0 + sec(500))).toBe(0);
  });

  it("divides the line between parallel stations", () => {
    let s = joinMany(booth(2, 60), 6);
    s = callNext(callNext(s, T0), T0); // both stations busy, 4 waiting
    expect(estimateWaitSec(s, 1, T0)).toBe(60);
    expect(estimateWaitSec(s, 2, T0)).toBe(60);
    expect(estimateWaitSec(s, 3, T0)).toBe(120);
    expect(estimateWaitSec(s, 4, T0)).toBe(120);
  });

  it("learns the real service time", () => {
    let s = joinMany(booth(1, 60), 10);
    s = callNext(s, T0);
    // Visitors actually take 120s each
    for (let i = 1; i <= 8; i++) s = callNext(s, T0 + sec(120 * i));
    expect(s.avgServiceSec).toBeGreaterThan(110);
    expect(s.avgServiceSec).toBeLessThanOrEqual(120);
  });

  it("clamps outliers so one long visit can't wreck the estimate", () => {
    const s = booth(1, 60);
    expect(updateAverage(s, 10_000)).toBe(0.3 * 300 + 0.7 * 60); // clamped to 5x
    expect(updateAverage(s, 0)).toBe(Math.round((0.3 * 12 + 0.7 * 60) * 10) / 10); // clamped to 0.2x
  });
});
