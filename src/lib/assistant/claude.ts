import type Anthropic from "@anthropic-ai/sdk";
import type { QueueStore } from "../store/types";
import { MAX_TOOL_ROUNDS, SYSTEM_PROMPT, type AssistantResult, type ChatTurn } from "./common";
import { TOOLS, runTool } from "./tools";

type BetaParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;

/** The one SDK call we use, so tests can pass a fake instead of the real client. */
export type CreateMessage = (params: BetaParams) => Promise<BetaMessage>;

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

/** Claude version of the tool-use loop (Anthropic Messages API). */
export async function runClaude(
  history: ChatTurn[],
  deps: { create: CreateMessage; store: QueueStore; now?: () => number; model?: string },
): Promise<AssistantResult> {
  const now = deps.now ?? Date.now;
  const messages: BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
  const toolsUsed: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await deps.create({
      model: deps.model ?? DEFAULT_CLAUDE_MODEL,
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
      return { reply: reply || "Sorry, I didn't catch that. Could you ask again?", toolsUsed, source: "claude" };
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

