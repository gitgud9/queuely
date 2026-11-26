import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Server-Sent Events stream of booth state (in-memory mode only). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  if (!store.subscribe) return new Response("Realtime is handled by Supabase", { status: 404 });
  const initial = await store.get(id);
  if (!initial) return new Response("Booth not found", { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      send(initial);
      const off = store.subscribe!(id, send);
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15000);
      cleanup = () => {
        off();
        clearInterval(ping);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
