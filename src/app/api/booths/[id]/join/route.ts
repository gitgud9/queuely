import { handle, json } from "@/lib/api";
import { join } from "@/lib/queue";
import { getStore } from "@/lib/store";
import { ticketToken } from "@/lib/token";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { state, result } = await getStore().update(id, (s) => {
      const r = join(s, Date.now());
      return { state: r.state, result: r.ticket };
    });
    return json(
      { number: result.number, joinedAt: result.joinedAt, token: ticketToken(id, result.number, result.joinedAt), booth: state },
      201,
    );
  });
}
