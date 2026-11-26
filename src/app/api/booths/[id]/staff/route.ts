import { handle, json } from "@/lib/api";
import { applyStaffAction } from "@/lib/queue";
import { getStore } from "@/lib/store";
import { checkStaffPin } from "@/lib/token";
import type { StaffAction } from "@/lib/types";

const ACTIONS = new Set(["callNext", "done", "skip", "recall", "pause", "resume", "reset"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    if (!checkStaffPin(req.headers.get("x-staff-pin"))) return json({ error: "Wrong staff PIN" }, 401);
    const action = (await req.json()) as StaffAction;
    if (!action || !ACTIONS.has(action.type)) return json({ error: "Unknown action" }, 400);
    if ("number" in action) action.number = Number(action.number);
    const { state } = await getStore().update(id, (s) => ({ state: applyStaffAction(s, action, Date.now()), result: null }));
    return json({ booth: state });
  });
}
