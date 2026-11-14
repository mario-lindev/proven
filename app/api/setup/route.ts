// Local-only key setup: writes keys into .env.local and sets MOCK=0. Never returns key values.
// Refused on Vercel / production and from any host other than localhost.
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";

const NAMES = ["TELEM_API_KEY", "TAVILY_API_KEY", "ANTHROPIC_API_KEY"] as const;

function allowed(req: Request) {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") return false;
  const host = req.headers.get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  const origin = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  return origin === null || origin === `http://${host}` || origin === `https://${host}`;
}

export async function POST(req: Request) {
  if (!allowed(req)) return fail("setup is only available on localhost in development", 403);
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return fail("setup expects a JSON request", 415);
  }
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("setup expects a JSON object", 400);
  }
  const keys = body as Record<string, unknown>;
  const path = join(process.cwd(), ".env.local");
  const example = join(process.cwd(), ".env.example");
  const configuredDefaults = new Map(
    readFileSync(example, "utf8").split("\n")
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter((match) => match !== null)
      .map((match) => [match[1], match[2]] as const),
  );
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "") : [];
  const env = new Map<string, string>();
  const order: string[] = [];
  for (const l of lines) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      if (!env.has(m[1])) order.push(m[1]);
      env.set(m[1], m[2]);
    }
  }
  const put = (k: string, v: string) => {
    if (!env.has(k)) order.push(k);
    env.set(k, v);
  };
  for (const k of NAMES) {
    const raw = keys[k];
    if (raw !== undefined && typeof raw !== "string") return fail(`${k} must be a string`, 400);
    const v = raw?.trim();
    if (v) {
      if (/\s/.test(v)) return fail(`${k} has a space in it; paste just the key`, 400);
      put(k, v);
    }
  }
  put("MOCK", "0");
  for (const [name, value] of configuredDefaults) {
    if (value && !env.has(name)) put(name, value);
  }
  writeFileSync(path, order.map((k) => `${k}=${env.get(k)}`).join("\n") + "\n");
  chmodSync(path, 0o600);
  const set = Object.fromEntries(NAMES.map((k) => [k, !!env.get(k)?.trim()]));
  return NextResponse.json({ ok: true, saved: set });
}
