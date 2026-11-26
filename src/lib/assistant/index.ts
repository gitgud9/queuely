import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI } from "@google/genai";
import type { QueueStore } from "../store/types";
import { runClaude } from "./claude";
import type { AnswerSource, AssistantResult, ChatTurn } from "./common";
import { runGeminiWithFallback } from "./gemini";
import { quickAnswer } from "./quick";

/** Which AI is set up. Gemini first because its free tier needs no card. */
export function pickProvider(env: Record<string, string | undefined> = process.env): AnswerSource {
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.ANTHROPIC_API_KEY) return "claude";
  return "quick";
}

let gemini: GoogleGenAI | null = null;
let claude: Anthropic | null = null;

export const BUSY_NOTE = "The AI is busy (free limit reached), so this is a quick answer.";
export const OFFLINE_NOTE = "Quick answer mode: no AI key is set up.";

function isRateLimit(e: unknown) {
  return (e instanceof ApiError && e.status === 429) || e instanceof Anthropic.RateLimitError;
}

/**
 * Answer with the configured AI. If there is no key, or the AI fails (most
 * often the free tier's rate limit), fall back to the built-in quick answers
 * so the demo never shows an error.
 */
export async function answer(
  history: ChatTurn[],
  deps: { store: QueueStore; env?: Record<string, string | undefined>; now?: () => number; run?: (h: ChatTurn[]) => Promise<AssistantResult> },
): Promise<AssistantResult> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const provider = pickProvider(env);
  const question = history[history.length - 1].content;

  if (provider === "quick" && !deps.run) return { ...(await quickAnswer(question, deps.store, now())), note: OFFLINE_NOTE };

  const run =
    deps.run ??
    ((h: ChatTurn[]) => {
      if (provider === "gemini") {
        gemini ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        return runGeminiWithFallback(h, { generate: (p) => gemini!.models.generateContent(p), store: deps.store, now, preferred: env.GEMINI_MODEL || undefined });
      }
      claude ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      return runClaude(h, { create: (p) => claude!.beta.messages.create(p), store: deps.store, now, model: env.ASSISTANT_MODEL || undefined });
    });

  try {
    return await run(history);
  } catch (e) {
    console.error(`AI provider failed (${provider}):`, isRateLimit(e) ? "rate limited" : e);
    const quick = await quickAnswer(question, deps.store, now());
    return { ...quick, note: isRateLimit(e) ? BUSY_NOTE : "The AI hit a problem, so this is a quick answer." };
  }
}
