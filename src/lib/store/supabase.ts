import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BOOTHS } from "../booths";
import { createBooth } from "../queue";
import type { BoothState } from "../types";
import type { QueueStore } from "./types";

const MAX_RETRIES = 8;

/**
 * Postgres-backed store. Each booth is one row: { id, state jsonb, version }.
 * Writes use optimistic concurrency: "UPDATE ... WHERE version = <what I read>".
 * If two staff phones press "Call next" at the same moment, one write wins and
 * the other re-reads and retries, so no ticket number is ever handed out twice.
 *
 * Browsers subscribe to row changes with Supabase Realtime, so every screen
 * gets the new state within a fraction of a second.
 */
export class SupabaseStore implements QueueStore {
  private db: SupabaseClient;
  private seeded: Promise<void> | null = null;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  private seed() {
    this.seeded ??= (async () => {
      const rows = DEFAULT_BOOTHS.map((b) => ({ id: b.id, state: createBooth(b), version: 0 }));
      const { error } = await this.db.from("booths").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
      if (error) {
        this.seeded = null;
        throw new Error(`Seeding booths failed: ${error.message}`);
      }
    })();
    return this.seeded;
  }

  async list() {
    await this.seed();
    const { data, error } = await this.db.from("booths").select("state, version").order("id");
    if (error) throw new Error(error.message);
    return data.map((r) => ({ ...(r.state as BoothState), version: r.version }));
  }

  async get(id: string) {
    await this.seed();
    const { data, error } = await this.db.from("booths").select("state, version").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { ...(data.state as BoothState), version: data.version } : null;
  }

  async update<R>(id: string, fn: (s: BoothState) => { state: BoothState; result: R }) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const current = await this.get(id);
      if (!current) throw new Error(`Unknown booth ${id}`);
      const { state, result } = fn(current);
      const saved = { ...state, version: current.version + 1 };
      const { data, error } = await this.db
        .from("booths")
        .update({ state: saved, version: saved.version, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("version", current.version)
        .select("id");
      if (error) throw new Error(error.message);
      if (data.length === 1) return { state: saved, result };
      // Someone else wrote first. Back off a little and try again on fresh data.
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 40 * (attempt + 1)));
    }
    throw new Error("The queue is very busy, please try again");
  }
}
