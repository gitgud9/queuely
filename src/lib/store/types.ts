import type { BoothState } from "../types";

export interface QueueStore {
  list(): Promise<BoothState[]>;
  get(id: string): Promise<BoothState | null>;
  /**
   * Atomically read-modify-write one booth. `fn` is a pure function and may be
   * called more than once if another request changed the booth at the same time.
   */
  update<R>(id: string, fn: (s: BoothState) => { state: BoothState; result: R }): Promise<{ state: BoothState; result: R }>;
  /** Push-based updates (only the in-memory store; Supabase clients subscribe directly). */
  subscribe?(id: string, cb: (s: BoothState) => void): () => void;
}
