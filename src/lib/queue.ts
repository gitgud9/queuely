import type { BoothConfig, BoothState, StaffAction, Ticket } from "./types";

/** Error a visitor or staff member can see (bad request, not a crash). */
export class QueueError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

/** How many finished tickets we keep for the "recently served" list. */
export const HISTORY_LIMIT = 30;
/** Weight of the newest service time in the moving average. */
export const EMA_ALPHA = 0.3;

export function createBooth(config: BoothConfig): BoothState {
  return {
    ...config,
    version: 0,
    paused: false,
    nextNumber: 1,
    avgServiceSec: config.defaultServiceSec,
    servedCount: 0,
    skippedCount: 0,
    tickets: [],
  };
}

export const waiting = (s: BoothState) =>
  s.tickets.filter((t) => t.status === "waiting").sort((a, b) => a.number - b.number);

export const called = (s: BoothState) =>
  s.tickets.filter((t) => t.status === "called").sort((a, b) => (a.calledAt ?? 0) - (b.calledAt ?? 0));

export const findTicket = (s: BoothState, n: number) => s.tickets.find((t) => t.number === n);

/** 1-based place in line, or null when the ticket is not waiting. */
export function positionOf(s: BoothState, n: number): number | null {
  const i = waiting(s).findIndex((t) => t.number === n);
  return i === -1 ? null : i + 1;
}

/**
 * Estimated seconds until the visitor at `position` is called.
 *
 * The booth serves `capacity` people at once. If a slot is free right now the
 * visitor only waits for staff to press "Call next", so the estimate is 0.
 * Otherwise each "round" of `capacity` people takes about `avgServiceSec`,
 * and we subtract the time the longest-running visitor has already spent.
 */
export function estimateWaitSec(s: BoothState, position: number, now: number): number {
  if (position < 1) return 0;
  const inService = called(s);
  const freeSlots = Math.max(0, s.capacity - inService.length);
  const ahead = position - freeSlots; // people who must finish before you get a slot
  if (ahead <= 0) return 0;
  const rounds = Math.ceil(ahead / s.capacity);
  const oldest = inService[0]?.calledAt;
  const elapsed = oldest ? Math.min((now - oldest) / 1000, s.avgServiceSec) : 0;
  return Math.max(0, Math.round(rounds * s.avgServiceSec - elapsed));
}

/**
 * Update the average service time with a new sample. Samples are clamped
 * so one visitor who stayed for an hour (or a mis-click that ended a session
 * after 2 seconds) can't wreck everyone else's estimate.
 */
export function updateAverage(s: BoothState, sampleSec: number): number {
  const min = s.defaultServiceSec * 0.2;
  const max = s.defaultServiceSec * 5;
  const clamped = Math.min(max, Math.max(min, sampleSec));
  return Math.round((EMA_ALPHA * clamped + (1 - EMA_ALPHA) * s.avgServiceSec) * 10) / 10;
}

function trimHistory(tickets: Ticket[]): Ticket[] {
  const active = tickets.filter((t) => t.status === "waiting" || t.status === "called");
  const done = tickets
    .filter((t) => t.status !== "waiting" && t.status !== "called")
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    .slice(0, HISTORY_LIMIT);
  return [...active, ...done].sort((a, b) => a.number - b.number);
}

function replace(s: BoothState, t: Ticket): Ticket[] {
  return s.tickets.map((x) => (x.number === t.number ? t : x));
}

function finish(s: BoothState, n: number, now: number): BoothState {
  const t = findTicket(s, n);
  if (!t || t.status !== "called") throw new QueueError(`Ticket ${n} is not being served`, "not_called");
  const sample = (now - (t.calledAt ?? now)) / 1000;
  return {
    ...s,
    avgServiceSec: updateAverage(s, sample),
    servedCount: s.servedCount + 1,
    tickets: replace(s, { ...t, status: "served", endedAt: now }),
  };
}

export function join(s: BoothState, now: number): { state: BoothState; ticket: Ticket } {
  if (s.paused) throw new QueueError("This queue is paused. Please try again soon.", "paused");
  const ticket: Ticket = { number: s.nextNumber, status: "waiting", joinedAt: now };
  return {
    ticket,
    state: { ...s, nextNumber: s.nextNumber + 1, tickets: [...s.tickets, ticket] },
  };
}

export function leave(s: BoothState, n: number, now: number): BoothState {
  const t = findTicket(s, n);
  if (!t || t.status !== "waiting") throw new QueueError("You are not in this queue", "not_waiting");
  return { ...s, tickets: replace(s, { ...t, status: "left", endedAt: now }) };
}

/**
 * Call the next visitor. If every slot is full, the visitor who has been in
 * the longest is marked as served first, so on a one-person booth staff only
 * ever need to press one button.
 */
export function callNext(s: BoothState, now: number): BoothState {
  const next = waiting(s)[0];
  if (!next) throw new QueueError("Nobody is waiting", "empty");
  let state = s;
  const inService = called(state);
  if (inService.length >= state.capacity) state = finish(state, inService[0].number, now);
  return { ...state, tickets: replace(state, { ...next, status: "called", calledAt: now }) };
}

export function applyStaffAction(s: BoothState, action: StaffAction, now: number): BoothState {
  let next: BoothState;
  switch (action.type) {
    case "callNext":
      next = callNext(s, now);
      break;
    case "done":
      next = finish(s, action.number, now);
      break;
    case "skip": {
      const t = findTicket(s, action.number);
      if (!t || t.status !== "called") throw new QueueError(`Ticket ${action.number} is not being served`, "not_called");
      next = { ...s, skippedCount: s.skippedCount + 1, tickets: replace(s, { ...t, status: "skipped", endedAt: now }) };
      break;
    }
    case "recall": {
      // A "no-show" turned up late: serve them now instead of sending them to the back.
      const t = findTicket(s, action.number);
      if (!t || t.status !== "skipped") throw new QueueError(`Ticket ${action.number} was not skipped`, "not_skipped");
      next = {
        ...s,
        skippedCount: Math.max(0, s.skippedCount - 1),
        tickets: replace(s, { ...t, status: "called", calledAt: now, endedAt: undefined }),
      };
      break;
    }
    case "pause":
      next = { ...s, paused: true };
      break;
    case "resume":
      next = { ...s, paused: false };
      break;
    case "reset":
      next = { ...createBooth(s), version: s.version };
      break;
  }
  return { ...next, tickets: trimHistory(next.tickets) };
}

/** Public, display-friendly label like "VR-007". */
export const label = (s: Pick<BoothConfig, "prefix">, n: number) => `${s.prefix}-${String(n).padStart(3, "0")}`;
