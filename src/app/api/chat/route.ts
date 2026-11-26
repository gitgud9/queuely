import Anthropic from "@anthropic-ai/sdk";
import { json } from "@/lib/api";
import { parseHistory, runAssistant } from "@/lib/assistant/agent";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let client: Anthropic | null = null;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "The assistant isn't set up yet: the server has no ANTHROPIC_API_KEY." }, 503);
  }
  const history = parseHistory(await req.json().catch(() => null));
  if (typeof history === "string") return json({ error: history }, 400);

  client ??= new Anthropic();
  try {
    const result = await runAssistant(history, {
      create: (params) => client!.beta.messages.create(params),
      store: getStore(),
      model: process.env.ASSISTANT_MODEL || undefined,
    });
    return json(result);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic API key was rejected");
      return json({ error: "The assistant's API key is invalid." }, 503);
    }
    if (e instanceof Anthropic.RateLimitError) return json({ error: "The assistant is busy. Try again in a moment." }, 429);
    console.error(e);
    return json({ error: "The assistant hit a problem. Please try again." }, 502);
  }
}
