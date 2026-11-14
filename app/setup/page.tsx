"use client";

import { useState } from "react";

const FIELDS = [
  ["TELEM_API_KEY", "Telem key", "From hack.telem.ai → API keys → Issue API key"],
  ["TAVILY_API_KEY", "Tavily key", "From app.tavily.com, starts with tvly-"],
  ["ANTHROPIC_API_KEY", "Anthropic key", "From console.anthropic.com, starts with sk-ant-"],
] as const;

export default function Setup() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      const missing = Object.entries(data.saved as Record<string, boolean>).filter(([, v]) => !v).map(([k]) => k);
      setMsg(missing.length ? `Saved. Still missing: ${missing.join(", ")}` : "Saved. All 3 keys set.");
      setVals({});
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Set API keys</h1>
        <p className="mt-2 text-sm opacity-70">Saved to .env.local on this computer only. Leave a box empty to keep a key that is already set.</p>
      </div>
      {FIELDS.map(([name, label, hint]) => (
        <label key={name} className="block">
          <span className="font-semibold">{label}</span>
          <span className="ml-2 text-sm opacity-60">{hint}</span>
          <input
            type="password"
            autoComplete="off"
            value={vals[name] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [name]: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-current/30 px-3 py-2 font-mono"
          />
        </label>
      ))}
      <button type="submit" disabled={busy} className="rounded-md bg-black px-5 py-2 font-semibold text-white disabled:opacity-50">
        {busy ? "Saving" : "Save keys"}
      </button>
      {msg && <p className="font-semibold">{msg}</p>}
    </form>
  );
}
