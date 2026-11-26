import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { storeMode } from "../store";
import { DEFAULT_EVENT } from "./defaults";
import type { EventInfo } from "./types";

export interface StoredEvent {
  event: EventInfo;
  /** "saved" = from the database, "sample" = nothing saved yet (or no table), using the sample event. */
  source: "saved" | "sample";
  updatedAt: string | null;
}

export interface EventStore {
  get(): Promise<StoredEvent>;
  set(event: EventInfo): Promise<StoredEvent>;
}

/** Thrown when the event_info table hasn't been created in Supabase yet. */
export class MissingTableError extends Error {
  constructor() {
    super("The event_info table doesn't exist yet. Run supabase/schema.sql in the Supabase SQL editor, then try again.");
  }
}

export class MemoryEventStore implements EventStore {
  private saved: StoredEvent | null = null;
  async get() {
    return this.saved ?? { event: DEFAULT_EVENT, source: "sample" as const, updatedAt: null };
  }
  async set(event: EventInfo) {
    this.saved = { event, source: "saved", updatedAt: new Date().toISOString() };
    return this.saved;
  }
}

const ROW_ID = "current";
// Postgres "undefined_table", and PostgREST's "table not in schema cache".
const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205";

/**
 * One row in public.event_info holds the whole event as JSON. It's small,
 * read on every chat question and written only when staff press Save, so
 * one document is simpler than separate tables for places, sessions and FAQ.
 */
export class SupabaseEventStore implements EventStore {
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  async get(): Promise<StoredEvent> {
    const { data, error } = await this.db.from("event_info").select("data, updated_at").eq("id", ROW_ID).maybeSingle();
    if (error) {
      // Before the table exists, keep the app working on the sample event.
      if (isMissingTable(error.code)) return { event: DEFAULT_EVENT, source: "sample", updatedAt: null };
      throw new Error(error.message);
    }
    if (!data) return { event: DEFAULT_EVENT, source: "sample", updatedAt: null };
    return { event: { ...DEFAULT_EVENT, ...(data.data as EventInfo) }, source: "saved", updatedAt: data.updated_at };
  }

  async set(event: EventInfo): Promise<StoredEvent> {
    const updatedAt = new Date().toISOString();
    const { error } = await this.db.from("event_info").upsert({ id: ROW_ID, data: event, updated_at: updatedAt });
    if (error) {
      if (isMissingTable(error.code)) throw new MissingTableError();
      throw new Error(error.message);
    }
    return { event, source: "saved", updatedAt };
  }
}

const g = globalThis as unknown as { __eventStore?: EventStore };

export function getEventStore(): EventStore {
  g.__eventStore ??=
    storeMode() === "supabase"
      ? new SupabaseEventStore(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      : new MemoryEventStore();
  return g.__eventStore;
}

/** For the assistant: never fail a visitor's question because the event info couldn't load. */
export async function loadEventOrSample(): Promise<EventInfo> {
  try {
    return (await getEventStore().get()).event;
  } catch (e) {
    console.error("Loading event info failed, using the sample event:", e);
    return DEFAULT_EVENT;
  }
}
