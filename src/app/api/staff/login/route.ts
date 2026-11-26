import { json } from "@/lib/api";
import { checkStaffPin } from "@/lib/token";

export async function POST(req: Request) {
  const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
  return checkStaffPin(pin ?? null) ? json({ ok: true }) : json({ error: "Wrong staff PIN" }, 401);
}
