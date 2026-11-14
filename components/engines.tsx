import type { Engine } from "@/lib/types";
import { fmtMs } from "./http";

// One steady colour per engine so the same engine reads the same everywhere.
// Tavily is drawn in ink; every other engine was chosen by Telem's router.
const HUES: Record<string, string> = {
  exa: "#2c46c9",
  brave: "#c2410c",
  linkup: "#0f766e",
  reddit: "#d9480f",
  linkedin: "#1d5fa8",
  tavily_web: "#6d4bb3",
  telem_fetch: "#2c46c9",
  google: "#2f7d32",
  bing: "#0e7490",
  perplexity: "#155e63",
  youtube: "#b91c1c",
  tiktok: "#334155",
  x: "#334155",
  wechat: "#15803d",
};
const SPARE = ["#7c3aed", "#0369a1", "#a16207", "#be185d", "#4d7c0f", "#9a3412", "#1e40af", "#0f766e"];

export const isTavily = (name: string) => name.toLowerCase() === "tavily";

export function engineColor(name: string) {
  const n = name.toLowerCase();
  if (isTavily(n)) return "#14202b";
  if (HUES[n]) return HUES[n];
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SPARE[h % SPARE.length];
}

export const engineLabel = (name: string) => (isTavily(name) ? "Tavily" : name.replace(/_/g, " "));

export function EngineDot({ name, size = 8 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: engineColor(name) }}
    />
  );
}

// One engine's answer: name, latency bar (scaled to `scale` ms), latency and results.
export function EngineBar({ e, scale, animate = false }: { e: Engine; scale: number; animate?: boolean }) {
  const pct = Math.max(4, Math.min(100, (e.latency_ms / Math.max(scale, 1)) * 100));
  const color = engineColor(e.name);
  return (
    <div
      className={`min-w-0 ${e.error ? "opacity-55" : ""}`}
      title={e.error ? `${engineLabel(e.name)} failed: ${e.error}` : `${engineLabel(e.name)}: ${e.n_results} results in ${fmtMs(e.latency_ms)}`}
    >
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <EngineDot name={e.name} />
          <span className={`truncate font-medium ${e.error ? "line-through decoration-graphite/60" : ""}`}>
            {engineLabel(e.name)}
          </span>
        </span>
        <span className="tnum shrink-0 text-graphite">
          {e.error ? "failed" : `${e.n_results} in ${fmtMs(e.latency_ms)}`}
        </span>
      </div>
      <div className="mt-1 h-[3px] w-full bg-rule-soft">
        <div
          className={`h-full ${animate ? "bar-in" : ""}`}
          style={{ width: `${pct}%`, background: e.error ? "#8c96a0" : color }}
        />
      </div>
    </div>
  );
}

// Splits a search step's engines into the ones Telem routed to and Tavily.
export function splitEngines(engines: Engine[] = []) {
  return {
    telem: engines.filter((e) => !isTavily(e.name)),
    tavily: engines.filter((e) => isTavily(e.name)),
  };
}
