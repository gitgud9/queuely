import type { Content, GenerateContentParameters, GenerateContentResponse, Part } from "@google/genai";
import type { QueueStore } from "../store/types";
import { MAX_TOOL_ROUNDS, SYSTEM_PROMPT, type AssistantResult, type ChatTurn } from "./common";
import { TOOL_SPECS, runTool } from "./tools";

/** "Latest Flash" alias: free tier in Google AI Studio, and it doesn't break when Google retires a version. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

/** The one SDK call we use, so tests can pass a fake instead of the real client. */
export type GenerateContent = (params: GenerateContentParameters) => Promise<GenerateContentResponse>;

/**
 * Gemini version of the tool-use loop. Same idea as the Claude one:
 * ask the model, and while it asks for tools, run them and send the results back.
 */
export async function runGemini(
  history: ChatTurn[],
  deps: { generate: GenerateContent; store: QueueStore; now?: () => number; model?: string },
): Promise<AssistantResult> {
  const now = deps.now ?? Date.now;
  const contents: Content[] = history.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] }));
  const toolsUsed: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await deps.generate({
      model: deps.model ?? DEFAULT_GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
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
          output = { output: JSON.parse(await runTool(name, call.args, { store: deps.store, now: now() })) };
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
