import type Anthropic from "@anthropic-ai/sdk";
import type { QueueStore } from "../store/types";
import { eventInfoText } from "./eventInfo";
import { TOOLS, runTool } from "./tools";

type BetaParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;

/** The one SDK call we use, so tests can pass a fake instead of the real client. */
export type CreateMessage = (params: BetaParams) => Promise<BetaMessage>;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const DEFAULT_MODEL = "claude-opus-5-5";
/** Hard stop so a confused model can't loop on tools forever (and run up a bill). */
export const MAX_TOOL_ROUNDS = 5;

export const SYSTEM_PROMPT = `You are the friendly visitor assistant for a festival that uses the Queuely virtual queue system. Visitors chat with you on their phones while walking around.

How to answer:
- Keep replies short: one to three sentences, or a short list. Plain text, no headings or tables.
- For anything about queues or wait times, call get_live_queues first. Never guess or reuse old numbers. Quote the wait as given (for example "about 4 min").
- For anything about times or what's on, call get_schedule. It also tells you the current event time.
- When recommending a booth, mention its location, and that they can join from the home page or by scanning the booth's QR code.
- Only use the event info below and your tools. If you don't know (for example a place not listed), say so and point them to the info counter at the Hall A entrance.
- If a booth is paused, say it's not taking new joins right now.
- Stay on festival topics. Politely decline anything else.

${eventInfoText()}`;

export interface AssistantResult {
  reply: string;
  toolsUsed: string[];
}

export async function runAssistant(
  history: ChatTurn[],
  deps: { create: CreateMessage; store: QueueStore; now?: () => number; model?: string },
): Promise<AssistantResult> {
  const now = deps.now ?? Date.now;
  const messages: BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
  const toolsUsed: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await deps.create({
      model: deps.model ?? DEFAULT_MODEL,
      max_tokens: 2048,
      // Chat answers are simple; low effort keeps them fast and cheap.
      output_config: { effort: "low" },
      // If the model declines a request, the API retries it on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { reply: "Sorry, I can't help with that. I can answer questions about the festival, its booths and queues.", toolsUsed };
    }

    if (response.stop_reason !== "tool_use") {
      const reply = response.content
        .flatMap((b) => (b.type === "text" ? [b.text] : []))
        .join("")
        .trim();
      return { reply: reply || "Sorry, I didn't catch that. Could you ask again?", toolsUsed };
    }

    // Keep the whole assistant turn (thinking + tool_use blocks) exactly as returned.
    messages.push({ role: "assistant", content: response.content });
    const calls = response.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
    // All results go back in ONE user message, as the API expects.
    const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = await Promise.all(
      calls.map(async (call) => {
        toolsUsed.push(call.name);
        try {
          return { type: "tool_result" as const, tool_use_id: call.id, content: await runTool(call.name, call.input, { store: deps.store, now: now() }) };
        } catch (e) {
          return { type: "tool_result" as const, tool_use_id: call.id, content: `Error: ${e instanceof Error ? e.message : String(e)}`, is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }

  return { reply: "Sorry, that took too long to work out. Please try asking in a simpler way.", toolsUsed };
}

/** Check what the browser sent before it reaches the model (and our bill). */
export function parseHistory(body: unknown): ChatTurn[] | string {
  const msgs = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) return "Send at least one message.";
  if (msgs.length > 20) return "This chat is too long. Refresh the page to start a new one.";
  const turns: ChatTurn[] = [];
  for (const m of msgs) {
    const { role, content } = (m ?? {}) as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) return "Invalid message.";
    if (content.length > 1000) return "Please keep messages under 1000 characters.";
    turns.push({ role, content: content.trim() });
  }
  if (turns[0].role !== "user" || turns[turns.length - 1].role !== "user") return "The chat must start and end with a visitor message.";
  return turns;
}
