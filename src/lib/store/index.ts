import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { QueueStore } from "./types";

export function storeMode(): "supabase" | "memory" {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "memory";
}

const g = globalThis as unknown as { __queueStore?: QueueStore };

/** One store per server process (kept on globalThis so dev hot-reloads don't wipe it). */
export function getStore(): QueueStore {
  if (!g.__queueStore) {
    g.__queueStore =
      storeMode() === "supabase"
        ? new SupabaseStore(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
        : new MemoryStore();
  }
  return g.__queueStore;
}
