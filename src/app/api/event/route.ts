import { handle, json } from "@/lib/api";
import { getEventStore, MissingTableError } from "@/lib/event/store";
import { validateEventInfo } from "@/lib/event/validate";
import { checkStaffPin } from "@/lib/token";

export const dynamic = "force-dynamic";

/** Anyone can read the event info (it's what visitors are told anyway). */
export function GET() {
  return handle(async () => json(await getEventStore().get()));
}

/** Staff replace the whole event info (PIN required). */
export async function PUT(req: Request) {
  return handle(async () => {
    if (!checkStaffPin(req.headers.get("x-staff-pin"))) return json({ error: "Wrong staff PIN" }, 401);
    const event = validateEventInfo(await req.json().catch(() => null));
    if (typeof event === "string") return json({ error: event }, 400);
    try {
      return json(await getEventStore().set(event));
    } catch (e) {
      if (e instanceof MissingTableError) return json({ error: e.message }, 503);
      throw e;
    }
  });
}
