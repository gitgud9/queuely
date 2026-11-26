import { EventEmitter } from "node:events";
import { DEFAULT_BOOTHS } from "../booths";
import { createBooth } from "../queue";
import type { BoothState } from "../types";
import type { QueueStore } from "./types";

/**
 * Single-process store for local development and tests. Node runs request
 * handlers on one thread, so a synchronous read-modify-write is atomic.
 * Updates are pushed to browsers over Server-Sent Events.
 */
export class MemoryStore implements QueueStore {
  private booths = new Map<string, BoothState>();
  private events = new EventEmitter();

  constructor() {
    this.events.setMaxListeners(0);
    for (const b of DEFAULT_BOOTHS) this.booths.set(b.id, createBooth(b));
  }

  async list() {
    return [...this.booths.values()];
  }

  async get(id: string) {
    return this.booths.get(id) ?? null;
  }

  async update<R>(id: string, fn: (s: BoothState) => { state: BoothState; result: R }) {
    const current = this.booths.get(id);
    if (!current) throw new Error(`Unknown booth ${id}`);
    const { state, result } = fn(current);
    const saved = { ...state, version: current.version + 1 };
    this.booths.set(id, saved);
    this.events.emit(id, saved);
    return { state: saved, result };
  }

  subscribe(id: string, cb: (s: BoothState) => void) {
    this.events.on(id, cb);
    return () => {
      this.events.off(id, cb);
    };
  }
}
