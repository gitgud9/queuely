import type Anthropic from "@anthropic-ai/sdk";
import { formatWait } from "../format";
import { called, estimateWaitSec, waiting } from "../queue";
import type { QueueStore } from "../store/types";
import { EVENT, eventClock, toMinutes, type EventInfo } from "./eventInfo";

/**
 * Tools the model can call. Each one is a plain async function over the same
 * store the rest of Queuely uses, so the assistant sees exactly the numbers
 * the guest home page shows. The model never gets database access, only these
 * read-only answers.
 */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments. Both Claude and Gemini accept this format. */
  parameters: { type: "object"; properties: Record<string, unknown>; additionalProperties: false };
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "get_live_queues",
    description:
      "Live queue status for the festival's queued booths (VR Experience, Gaming Arena, Photo Booth): people waiting, estimated wait for someone joining now, whether the booth is paused, and where it is. Call this for any question about queues, wait times, which booth is quickest, or whether to join now. Data is live, so call it again rather than reusing an old answer.",
    parameters: {
      type: "object",
      properties: {
        booth_id: {
          type: "string",
          enum: ["vr", "gaming", "photo"],
          description: "Only this booth. Leave out to get every booth.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_schedule",
    description:
      "The festival programme with the current event time, and which sessions are on now and coming up next. Call this for questions about what's on, times, or 'what can I do now'.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];

/** The same tools in Claude's format. */
export const TOOLS: Anthropic.Beta.BetaTool[] = TOOL_SPECS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
  strict: true,
}));

export interface BoothStatus {
  id: string;
  name: string;
  location: string;
  open: boolean;
  waiting: number;
  beingServed: number;
  estimatedWaitSec: number;
  estimatedWait: string;
}

export async function getLiveQueues(store: QueueStore, now: number, boothId?: string, event: EventInfo = EVENT): Promise<{ booths: BoothStatus[] }> {
  const all = await store.list();
  const booths = all
    .filter((b) => !boothId || b.id === boothId)
    .map((b) => {
      const line = waiting(b).length;
      const wait = estimateWaitSec(b, line + 1, now);
      return {
        id: b.id,
        name: b.name,
        location: event.places.find((p) => p.boothId === b.id)?.where ?? "Ask event staff",
        open: !b.paused,
        waiting: line,
        beingServed: called(b).length,
        estimatedWaitSec: wait,
        estimatedWait: b.paused ? "Paused, not taking new joins" : formatWait(wait),
      };
    })
    .sort((a, b) => Number(b.open) - Number(a.open) || a.estimatedWaitSec - b.estimatedWaitSec);
  return { booths };
}

export function getSchedule(now: number, event: EventInfo = EVENT) {
  const clock = eventClock(now, event.timeZone);
  const t = toMinutes(clock);
  const sessions = event.schedule.map((s) => ({
    ...s,
    status: toMinutes(s.end) <= t ? "finished" : toMinutes(s.start) <= t ? "on now" : "upcoming",
  }));
  const upcoming = sessions.filter((s) => s.status === "upcoming");
  return {
    currentEventTime: clock,
    onNow: sessions.filter((s) => s.status === "on now").map((s) => s.title),
    nextUp: upcoming[0]?.title ?? null,
    sessions,
  };
}

/** Run one tool call. Returns JSON text for the tool_result block. */
export async function runTool(name: string, input: unknown, ctx: { store: QueueStore; now: number; event?: EventInfo }): Promise<string> {
  const args = (input ?? {}) as { booth_id?: string };
  switch (name) {
    case "get_live_queues":
      return JSON.stringify(await getLiveQueues(ctx.store, ctx.now, args.booth_id, ctx.event));
    case "get_schedule":
      return JSON.stringify(getSchedule(ctx.now, ctx.event));
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}
