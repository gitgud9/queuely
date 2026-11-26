export type TicketStatus = "waiting" | "called" | "served" | "skipped" | "left";

export interface Ticket {
  number: number;
  status: TicketStatus;
  joinedAt: number; // epoch ms
  calledAt?: number;
  endedAt?: number;
}

export interface BoothConfig {
  id: string; // url slug, e.g. "vr"
  name: string;
  prefix: string; // shown before ticket numbers, e.g. "VR-007"
  description: string;
  capacity: number; // how many visitors can be served at the same time
  defaultServiceSec: number; // starting guess for how long one visitor takes
}

/**
 * Everything about one booth's queue lives in a single document.
 * Every change is a pure function (old state -> new state), and the store
 * writes it back atomically using `version` (optimistic concurrency).
 */
export interface BoothState extends BoothConfig {
  version: number;
  paused: boolean;
  nextNumber: number;
  avgServiceSec: number; // learned from real service times (moving average)
  servedCount: number;
  skippedCount: number;
  tickets: Ticket[]; // all active tickets + a short history of finished ones
}

export type StaffAction =
  | { type: "callNext" }
  | { type: "done"; number: number }
  | { type: "skip"; number: number }
  | { type: "recall"; number: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "reset" };
