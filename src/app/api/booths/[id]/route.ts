import { handle, json } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const booth = await getStore().get(id);
    return booth ? json(booth) : json({ error: "Booth not found" }, 404);
  });
}
