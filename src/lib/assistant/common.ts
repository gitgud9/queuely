import { eventInfoText } from "./eventInfo";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

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

export type AnswerSource = "gemini" | "claude" | "quick";

export interface AssistantResult {
  reply: string;
  toolsUsed: string[];
  /** Which brain answered: an AI model, or the built-in quick answers. */
  source?: AnswerSource;
  /** Shown under the reply when we fell back to quick answers. */
  note?: string;
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
