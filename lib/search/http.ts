// Server-side only. Provider errors deliberately exclude response bodies and credentials.
export async function post<T>(url: string, keyName: string, body?: unknown): Promise<T> {
  const key = process.env[keyName];
  if (!key) throw new Error(keyName + " is not configured");
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error(new URL(url).hostname + " request failed or timed out");
  }
  if (!response.ok) throw new Error(new URL(url).hostname + " returned HTTP " + response.status);
  try { return await response.json() as T; }
  catch { throw new Error(new URL(url).hostname + " returned invalid JSON"); }
}
