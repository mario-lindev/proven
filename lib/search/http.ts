// Shared helpers for the search layer: key lookup, 20 s timeout, readable errors.

export const TIMEOUT_MS = 20_000;

// One search result before it gets an id.
export type Hit = { url: string; title: string; engine: string; snippet: string; published?: string };

export function needKey(name: "TELEM_API_KEY" | "TAVILY_API_KEY"): string {
  const key = process.env[name];
  if (!key) throw new Error(`${name} is not set. Add it to .env.local (or run with MOCK=1).`);
  return key;
}

// Turn any provider error body into one line. Telem uses { detail } (a string, { reason }, or a 422 list)
// or { error: { code, message } }; Tavily uses { detail: { error } } or a 422 detail list.
export function errorText(e: unknown): string {
  if (e == null) return "";
  if (typeof e === "string") return e;
  if (Array.isArray(e)) return e.map(errorText).filter(Boolean).join("; ");
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    for (const k of ["detail", "error", "message", "reason", "msg"]) {
      const t = errorText(o[k]);
      if (t) return typeof o.code === "string" && k !== "error" ? `${o.code}: ${t}` : t;
    }
    if (typeof o.code === "string") return o.code;
    return JSON.stringify(e);
  }
  return String(e);
}

export async function postJSON<T>(label: string, url: string, key: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") throw new Error(`${label} timed out after ${TIMEOUT_MS / 1000} s`);
    throw new Error(`${label} request failed: ${(err as Error)?.message ?? String(err)}`);
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const msg = json !== undefined ? errorText(json) : text.slice(0, 300);
    throw new Error(`${label} HTTP ${res.status}: ${msg || res.statusText}`);
  }
  if (json === undefined) throw new Error(`${label} returned non-JSON: ${text.slice(0, 200)}`);
  return json as T;
}

// Snippets: collapse whitespace and cut to n chars.
export function clip(s: string | null | undefined, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}
