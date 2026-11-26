import { handle, json } from "@/lib/api";
import { findTicket, leave, QueueError } from "@/lib/queue";
import { getStore } from "@/lib/store";
import { verifyTicketToken } from "@/lib/token";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { number, joinedAt, token } = (await req.json()) as { number: number; joinedAt: number; token: string };
    if (!verifyTicketToken(id, Number(number), Number(joinedAt), token)) return json({ error: "Invalid ticket" }, 403);
    const { state } = await getStore().update(id, (s) => {
      const t = findTicket(s, Number(number));
      if (t?.joinedAt !== Number(joinedAt)) throw new QueueError("You are not in this queue", "not_waiting");
      return { state: leave(s, Number(number), Date.now()), result: null };
    });
    return json({ booth: state });
  });
}
