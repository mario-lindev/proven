// One helper for every Claude call: JSON out, matched to a schema, recorded in the trail.
import Anthropic from "@anthropic-ai/sdk";
import { providerUrl, requireSetting } from "../provider-config";
import type { TrailRecorder } from "../types";



export async function askJSON<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  label: string;
  trail: TrailRecorder;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<T> {
  const apiKey = requireSetting("ANTHROPIC_API_KEY");
  const baseURL = providerUrl("ANTHROPIC_BASE_URL");
  const model = requireSetting("ANTHROPIC_MODEL");
  const client = new Anthropic({ apiKey, baseURL });
  const t0 = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model,
    max_tokens: opts.maxTokens ?? 8000,
    system: wellFormed(opts.system),
    messages: [{ role: "user", content: wellFormed(opts.user) }],
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

// Page text cut mid-emoji leaves a lone surrogate, which makes the request body invalid JSON (400).
function wellFormed(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
}
