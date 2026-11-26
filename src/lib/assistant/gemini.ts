import { ApiError, type Content, type GenerateContentParameters, type GenerateContentResponse, type Part } from "@google/genai";
import type { QueueStore } from "../store/types";
import { MAX_TOOL_ROUNDS, systemPrompt, type AssistantResult, type ChatTurn } from "./common";
import { EVENT, type EventInfo } from "./eventInfo";
import { TOOL_SPECS, runTool } from "./tools";

/**
 * Free-tier models to try, in order. Flash-Lite goes first: short chat answers
 * don't need a bigger model, and on the live site the bigger ones were often
 * overloaded (503), which made visitors wait while we tried each one.
 * Google also renames and retires models often, so if one is gone (404), out
 * of free quota (429) or overloaded (503) we move on to the next instead of
 * failing. GEMINI_MODEL, if set, is tried first.
 */
export const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-4-hydrogen"];
export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0];

/** The one SDK call we use, so tests can pass a fake instead of the real client. */
export type GenerateContent = (params: GenerateContentParameters) => Promise<GenerateContentResponse>;

/**
 * Gemini version of the tool-use loop. Same idea as the Claude one:
 * ask the model, and while it asks for tools, run them and send the results back.
 */
export async function runGemini(
  history: ChatTurn[],
  deps: { generate: GenerateContent; store: QueueStore; now?: () => number; model?: string; event?: EventInfo },
): Promise<AssistantResult> {
  const now = deps.now ?? Date.now;
  const event = deps.event ?? EVENT;
  const contents: Content[] = history.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] }));
  const toolsUsed: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await deps.generate({
      model: deps.model ?? DEFAULT_GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: systemPrompt(event),
        maxOutputTokens: 1024,
        tools: [{ functionDeclarations: TOOL_SPECS.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
      },
    });

    const calls = response.functionCalls ?? [];
    if (calls.length === 0) {
      const reply = (response.text ?? "").trim();
      return { reply: reply || "Sorry, I didn't catch that. Could you ask again?", toolsUsed, source: "gemini" };
    }

    // Keep the model's turn exactly as returned (it can carry hidden "thought signatures").
    const modelTurn = response.candidates?.[0]?.content ?? { role: "model", parts: calls.map((c) => ({ functionCall: c })) };
    contents.push(modelTurn);
    // All results go back in one turn, matched to each call by name (and id when Gemini sends one).
    const parts: Part[] = await Promise.all(
      calls.map(async (call) => {
        const name = call.name ?? "";
        toolsUsed.push(name);
        let output: Record<string, unknown>;
        try {
          output = { output: JSON.parse(await runTool(name, call.args, { store: deps.store, now: now(), event })) };
        } catch (e) {
          output = { error: e instanceof Error ? e.message : String(e) };
        }
        return { functionResponse: { id: call.id, name, response: output } };
      }),
    );
    contents.push({ role: "user", parts });
  }

  return { reply: "Sorry, that took too long to work out. Please try asking in a simpler way.", toolsUsed, source: "gemini" };
}

/** Errors that mean "this model won't work for us right now, try another one": gone (404), no free quota (403/429), or overloaded (500/503). */
export const isModelUnavailable = (e: unknown) =>
  e instanceof ApiError && [403, 404, 429, 500, 503].includes(e.status);

let workingModel: string | null = null;

/**
 * Run the loop on the first model that works, and remember it so later
 * questions go straight there. Throws the last error if none work.
 */
export async function runGeminiWithFallback(
  history: ChatTurn[],
  deps: { generate: GenerateContent; store: QueueStore; now?: () => number; preferred?: string; event?: EventInfo },
): Promise<AssistantResult> {
  const chain = [...new Set([deps.preferred, workingModel, ...GEMINI_MODELS].filter((m): m is string => !!m))];
  let lastError: unknown;
  for (const model of chain) {
    try {
      const result = await runGemini(history, { ...deps, model });
      workingModel = model;
      return result;
    } catch (e) {
      if (!isModelUnavailable(e)) throw e;
      console.warn(`Gemini model ${model} unavailable (${(e as ApiError).status}), trying the next one`);
      if (workingModel === model) workingModel = null;
      lastError = e;
    }
  }
  throw lastError;
}

/** For tests. */
export const resetWorkingModel = () => {
  workingModel = null;
};
