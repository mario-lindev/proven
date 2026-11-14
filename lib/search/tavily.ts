import { post } from "./http";

export type Result = { url: string; title: string; content: string; published_date?: string };
export async function search(query: string) {
  const data = await post<{ results: Result[] }>("https://api.tavily.com/search", "TAVILY_API_KEY", {
    query, max_results: 5, topic: /\b(news|latest|recent|today)\b/i.test(query) ? "news" : "general",
  });
  if (!Array.isArray(data.results)) throw new Error("Tavily response is missing results");
  return data.results;
}
export async function extractPages(urls: string[]) {
  const data = await post<{
    results: { url: string; raw_content: string }[];
    failed_results?: { url: string; error: string }[];
  }>("https://api.tavily.com/extract", "TAVILY_API_KEY", { urls });
  if (!Array.isArray(data.results)) throw new Error("Tavily extraction response is missing results");
  return data;
}
