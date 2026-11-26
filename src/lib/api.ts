import { NextResponse } from "next/server";
import { QueueError } from "./queue";

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Turn thrown errors into JSON responses: QueueError -> 409, unknown booth -> 404. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof QueueError) return json({ error: e.message, code: e.code }, 409);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("Unknown booth")) return json({ error: "Booth not found" }, 404);
    console.error(e);
    return json({ error: "Something went wrong" }, 500);
  }
}
