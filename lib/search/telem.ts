import { post } from "./http";

export type Result = { url: string; title?: string; summary?: string; published_at?: string };
export type Run = {
  preprocessor_name: string; batch_index?: number; latency_ms?: number; status?: string; error?: unknown;
  output_payload?: {
    results?: Result[];
    fetched_results?: { url: string; content?: string; status?: string; error?: unknown; provider?: string }[];
  };
};
export type Response = { session_id?: string; preprocessor_runs: Run[] };
function validate(data: Response) {
  if (!Array.isArray(data.preprocessor_runs)) throw new Error("Telem response is missing preprocessor_runs");
  return data;
}
export async function searchBatch(queries: string[]) {
  return validate(await post<Response>("https://router.telem.ai/v1/search", "TELEM_API_KEY", {
    user_input: queries.map(query => ({ query })),
    search: { auto_routing: "accuracy", num_results: 5, tier: "default" },
  }));
}
export async function fetchPages(urls: string[]) {
  return validate(await post<Response>("https://router.telem.ai/v1/fetch", "TELEM_API_KEY", {
    urls, options: { tier: "default", inline_content: true },
  }));
}
export async function createMonitor(company: string) {
  const data = await post<{ id: string }>("https://router.telem.ai/v1/monitors", "TELEM_API_KEY", {
    query: company + " funding competitors lawsuits layoffs product announcements",
    options: { frequency: "1h" }, ttl: "30d",
  });
  if (typeof data.id !== "string" || !data.id) throw new Error("Telem monitor response is missing id");
  return { monitor_id: data.id };
}
export async function pollMonitor(id: string) {
  return validate(await post<Response>("https://router.telem.ai/v1/monitors/" + encodeURIComponent(id) + "/poll", "TELEM_API_KEY"));
}
