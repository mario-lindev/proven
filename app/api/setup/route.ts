// Local-only key setup: writes keys into .env.local and sets MOCK=0. Never returns key values.
// Refused on Vercel / production and from any host other than localhost.
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";

const NAMES = ["TELEM_API_KEY", "TAVILY_API_KEY", "ANTHROPIC_API_KEY"] as const;

function allowed(req: Request) {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") return false;
  const host = (req.headers.get("host") ?? "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1";
}

export async function POST(req: Request) {
  if (!allowed(req)) return fail("setup is only available on localhost in development", 403);
  const body = (await req.json().catch(() => ({}))) as Partial<Record<(typeof NAMES)[number], string>>;
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
    const v = body[k]?.trim();
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
