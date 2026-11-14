// One helper for every Claude call: JSON out, matched to a schema, recorded in the trail.
import Anthropic from "@anthropic-ai/sdk";
import type { TrailRecorder } from "../types";

const client = new Anthropic();
export const MODEL = "claude-opus-5-5";

export async function askJSON<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  label: string;
  trail: TrailRecorder;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<T> {
  const t0 = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    output_config: {
      effort: opts.effort ?? "medium",
      format: { type: "json_schema", schema: opts.schema },
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
  const res = await client.beta.messages.create(params);
  opts.trail.step({ kind: "llm", label: opts.label, ms: Date.now() - t0 });
  if (res.stop_reason === "refusal") throw new Error(`Claude declined: ${opts.label}`);
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  return JSON.parse(text) as T;
}
