import { handle, json } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => json(await getStore().list()));
}
