"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

// Architecture page: three sections, each built to stand alone as a 1920x1080 still (?section=flow|compare|stack).

const INK = "var(--color-ink)";
const GRAPHITE = "var(--color-graphite)";
const RULE = "var(--color-rule)";
const SURFACE = "var(--color-surface)";
const COBALT = "var(--color-cobalt)";
const COBALT_SOFT = "var(--color-cobalt-soft)";
const PURSUE = "var(--color-pursue)";
const PURSUE_SOFT = "var(--color-pursue-soft)";
const RUST = "var(--color-rust)";
const RUST_SOFT = "var(--color-rust-soft)";
const MONO = "var(--font-mono)";
const SERIF = "var(--font-serif)";

const NODE_Y = 250;
const NODE_H = 130;

type NodeDef = { x: number; w: number; title: string; lines: string[]; stroke?: string; fill?: string; size?: number };

const NODES: NodeDef[] = [
  { x: 20, w: 140, title: "Question", lines: ["what the investor", "asks"] },
  { x: 200, w: 200, title: "Plan", lines: ["Claude", "uses query shapes", "that proved out before"] },
  { x: 440, w: 260, title: "Route", lines: ["Telem", "labels the topic,", "picks engines per question"], stroke: COBALT, fill: COBALT_SOFT },
  { x: 740, w: 240, title: "Research until proven", lines: ["deep mode keeps searching", "the open questions"], size: 20 },
  { x: 1020, w: 190, title: "Write", lines: ["Claude", "from the sources only"] },
  { x: 1250, w: 230, title: "Prove", lines: ["every line checked", "against the page;", "exact quote found in code"], stroke: PURSUE, fill: PURSUE_SOFT },
  { x: 1520, w: 150, title: "Verdict", lines: ["+ Claims vs.", "reality"] },
];

const CHIP_ROWS = [
  ["exa", "you", "perplexity", "brave", "linkup", "parallel", "seltz", "ceramic"],
  ["LinkedIn", "X", "Reddit", "YouTube", "Trustpilot", "Product Hunt", "WeChat"],
];

function chipRow(names: string[], y: number, cx: number) {
  const widths = names.map((n) => n.length * 8.4 + 22);
  const total = widths.reduce((a, b) => a + b, 0) + (names.length - 1) * 8;
  let x = cx - total / 2;
  return names.map((name, i) => {
    const c = { name, x, y, w: widths[i] };
    x += widths[i] + 8;
    return c;
  });
}

function FlowChart() {
  const routeCx = 570;
  const chips = [...chipRow(CHIP_ROWS[0], 62, routeCx), ...chipRow(CHIP_ROWS[1], 112, routeCx)];
  const mid = NODE_Y + NODE_H / 2;
  return (
    <svg viewBox="0 0 1690 720" className="block h-auto w-full" role="img" aria-label="Flow chart: question, plan, route, research until proven, write, prove, verdict, with a learning loop back to route and plan">
      <defs>
        {[
          ["ink", INK],
          ["cobalt", COBALT],
          ["pursue", PURSUE],
          ["rust", RUST],
        ].map(([id, c]) => (
          <marker key={id} id={`how-arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={c} />
          </marker>
        ))}
      </defs>

      {/* Engine fan-out above Route */}
      <text x={routeCx} y={40} textAnchor="middle" style={{ fontFamily: MONO }} fontSize="14" fill={COBALT}>
        engines Telem routes to, per question
      </text>
      {chips.map((c) => (
        <line key={`l-${c.name}`} x1={routeCx} y1={NODE_Y} x2={c.x + c.w / 2} y2={c.y + 28} stroke={COBALT} strokeWidth="1" opacity="0.45" />
      ))}
      {chips.map((c) => (
        <g key={c.name}>
          <rect x={c.x} y={c.y} width={c.w} height={28} rx={8} fill={SURFACE} stroke={COBALT} strokeWidth="1.2" />
          <text x={c.x + c.w / 2} y={c.y + 19} textAnchor="middle" style={{ fontFamily: MONO }} fontSize="14" fill={COBALT}>
            {c.name}
          </text>
        </g>
      ))}

      {/* Main arrows */}
      {NODES.slice(0, -1).map((n, i) => (
        <line key={i} x1={n.x + n.w + 3} y1={mid} x2={NODES[i + 1].x - 4} y2={mid} stroke={INK} strokeWidth="2" markerEnd="url(#how-arrow-ink)" />
      ))}

      {/* Nodes */}
      {NODES.map((n) => (
        <g key={n.title}>
          <rect x={n.x} y={NODE_Y} width={n.w} height={NODE_H} rx={8} fill={n.fill ?? SURFACE} stroke={n.stroke ?? INK} strokeWidth={n.stroke ? 2.5 : 1.5} />
          <text x={n.x + 16} y={NODE_Y + 38} style={{ fontFamily: SERIF }} fontWeight="600" fontSize={n.size ?? 24} fill={n.stroke ?? INK}>
            {n.title}
          </text>
          {n.lines.map((l, i) => (
            <text key={l} x={n.x + 16} y={NODE_Y + 66 + i * 20} style={{ fontFamily: MONO }} fontSize="14" fill={i === 0 && n.lines.length === 3 ? INK : GRAPHITE}>
              {l}
            </text>
          ))}
        </g>
      ))}

      {/* Research loop */}
      <path d="M 940 380 C 940 440, 780 440, 780 387" fill="none" stroke={INK} strokeWidth="2" markerEnd="url(#how-arrow-ink)" />
      <text x={860} y={462} textAnchor="middle" style={{ fontFamily: MONO }} fontSize="14" fill={INK}>
        open questions → search again,
      </text>
      <text x={860} y={482} textAnchor="middle" style={{ fontFamily: MONO }} fontSize="14" fill={INK}>
        steered to engines that proved out
      </text>
      <text x={860} y={502} textAnchor="middle" style={{ fontFamily: MONO }} fontSize="14" fill={GRAPHITE}>
        up to 3 more rounds
      </text>

      {/* Dropped-line branch */}
      <line x1={1365} y1={NODE_Y} x2={1365} y2={186} stroke={RUST} strokeWidth="2" strokeDasharray="6 5" markerEnd="url(#how-arrow-rust)" />
      <rect x={1255} y={122} width={220} height={58} rx={8} fill={RUST_SOFT} stroke={RUST} strokeWidth="1.5" />
      <text x={1365} y={147} textAnchor="middle" style={{ fontFamily: MONO }} fontSize="14" fill={RUST}>
        no quote on the page
      </text>
      <text x={1365} y={167} textAnchor="middle" style={{ fontFamily: MONO }} fontSize="14" fontWeight="600" fill={RUST}>
        = line dropped
      </text>

      {/* Tavily beside Telem */}
      <line x1={620} y1={NODE_Y + NODE_H} x2={620} y2={420} stroke={INK} strokeWidth="1.5" strokeDasharray="4 4" />
      <rect x={530} y={420} width={180} height={84} rx={8} fill={SURFACE} stroke={INK} strokeWidth="1.5" />
      <text x={546} y={448} style={{ fontFamily: SERIF }} fontWeight="600" fontSize="20" fill={INK}>
        Tavily
      </text>
      <text x={546} y={470} style={{ fontFamily: MONO }} fontSize="14" fill={GRAPHITE}>
        direct search +
      </text>
      <text x={546} y={490} style={{ fontFamily: MONO }} fontSize="14" fill={GRAPHITE}>
        page reader
      </text>

      {/* Learn loop along the bottom */}
      <line x1={1365} y1={NODE_Y + NODE_H} x2={1365} y2={574} stroke={PURSUE} strokeWidth="2" markerEnd="url(#how-arrow-pursue)" />
      <text x={1377} y={480} style={{ fontFamily: MONO }} fontSize="14" fill={PURSUE}>
        verified lines
      </text>
      <rect x={1150} y={580} width={430} height={110} rx={8} fill={SURFACE} stroke={INK} strokeWidth="1.5" />
      <text x={1168} y={616} style={{ fontFamily: SERIF }} fontWeight="600" fontSize="24" fill={INK}>
        Learn
      </text>
      <text x={1168} y={644} style={{ fontFamily: MONO }} fontSize="14" fill={GRAPHITE}>
        an engine earns credit only when
      </text>
      <text x={1168} y={664} style={{ fontFamily: MONO }} fontSize="14" fill={GRAPHITE}>
        its page backs a verified line
      </text>
      <path d={`M 1150 635 L 490 635 L 490 ${NODE_Y + NODE_H + 6}`} fill="none" stroke={COBALT} strokeWidth="2" markerEnd="url(#how-arrow-cobalt)" />
      <path d={`M 490 635 L 300 635 L 300 ${NODE_Y + NODE_H + 6}`} fill="none" stroke={INK} strokeWidth="2" markerEnd="url(#how-arrow-ink)" />
      <text x={502} y={560} style={{ fontFamily: MONO }} fontSize="14" fill={COBALT}>
        engine scores,
      </text>
      <text x={502} y={580} style={{ fontFamily: MONO }} fontSize="14" fill={COBALT}>
        steering
      </text>
      <text x={312} y={560} style={{ fontFamily: MONO }} fontSize="14" fill={INK}>
        query hints
      </text>
      <text x={820} y={662} textAnchor="middle" style={{ fontFamily: MONO }} fontSize="14" fill={GRAPHITE}>
        what was proven ranks what gets read next time
      </text>
    </svg>
  );
}

function Title({ children, lede }: { children: React.ReactNode; lede: string }) {
  return (
    <header className="mb-10">
      <h2 className="serif text-[4rem] font-semibold leading-[0.98] tracking-[-0.02em] text-ink">{children}</h2>
      <p className="mt-4 max-w-[52rem] text-[1.25rem] leading-relaxed text-graphite">{lede}</p>
    </header>
  );
}

function Flow() {
  return (
    <section id="flow" className="w-full">
      <Title lede="A search engine gives you links. Proven gives you a verdict with the receipt.">How Proven works</Title>
      <FlowChart />
    </section>
  );
}

const COLUMNS = [
  {
    name: "A search engine",
    gives: "Gives you ten links.",
    points: ["You read them.", "Nothing is checked.", "The work is still yours."],
    kind: "links",
  },
  {
    name: "AI search",
    gives: "Answers the question you asked.",
    points: ["One question at a time.", "You decide what to check next.", "It does not audit a pitch, sit in on a call or keep watching."],
    kind: "answer",
  },
  {
    name: "Proven",
    gives: "Gives you a verdict.",
    points: [
      "Runs the whole diligence job from one click.",
      "Drops any line whose quote is not on the page it cites.",
      "Company claims are set against independent sources.",
      "It learns only from what it proved.",
    ],
    kind: "proven",
  },
] as const;

function Drawing({ kind }: { kind: "links" | "answer" | "proven" }) {
  const s = kind === "proven" ? PURSUE : GRAPHITE;
  return (
    <svg viewBox="0 0 320 150" className="block h-[150px] w-full" aria-hidden="true">
      {kind === "links" &&
        Array.from({ length: 10 }, (_, i) => (
          <line key={i} x1={i < 5 ? 10 : 170} y1={22 + (i % 5) * 26} x2={(i < 5 ? 10 : 170) + [120, 90, 135, 105, 80][i % 5]} y2={22 + (i % 5) * 26} stroke={s} strokeWidth="3" strokeLinecap="round" />
        ))}
      {kind === "answer" && (
        <>
          <path d="M10 14 H250 a8 8 0 0 1 8 8 V104 a8 8 0 0 1 -8 8 H60 L34 138 V112 H18 a8 8 0 0 1 -8 -8 Z" fill="none" stroke={s} strokeWidth="2" />
          {[38, 62, 86].map((y, i) => (
            <line key={y} x1={30} y1={y} x2={[236, 210, 150][i]} y2={y} stroke={s} strokeWidth="3" strokeLinecap="round" />
          ))}
        </>
      )}
      {kind === "proven" &&
        [24, 74, 124].map((y, i) => (
          <g key={y}>
            <path d={`M10 ${y} l7 7 l13 -15`} fill="none" stroke={PURSUE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <line x1={44} y1={y - 4} x2={[250, 220, 270][i]} y2={y - 4} stroke={INK} strokeWidth="3" strokeLinecap="round" />
            <line x1={44} y1={y + 12} x2={44} y2={y + 26} stroke={COBALT} strokeWidth="3" />
            <line x1={54} y1={y + 19} x2={[200, 240, 180][i]} y2={y + 19} stroke={COBALT} strokeWidth="2" strokeLinecap="round" strokeDasharray="1 6" />
          </g>
        ))}
    </svg>
  );
}

function Compare() {
  return (
    <section id="compare" className="w-full">
      <Title lede="Three ways to answer the same question. Only one shows its proof.">Why it is different</Title>
      <div className="grid grid-cols-3 gap-8">
        {COLUMNS.map((c) => {
          const us = c.kind === "proven";
          return (
            <div key={c.name} className={`rounded-[8px] border bg-surface p-10 ${us ? "border-2 border-pursue" : "border-rule"}`}>
              <p className={`font-mono text-[1rem] ${us ? "text-pursue" : "text-graphite"}`}>{c.name}</p>
              <p className="serif mt-3 text-[2.6rem] font-semibold leading-[1.05] text-ink">{c.gives}</p>
              <div className="my-8 border-y border-rule-soft py-6">
                <Drawing kind={c.kind} />
              </div>
              <ul className="space-y-3 text-[1.25rem] leading-snug text-ink">
                {c.points.map((p) => (
                  <li key={p} className={us ? "border-l-2 border-pursue pl-4" : "border-l-2 border-rule pl-4 text-graphite"}>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const LAYERS = [
  { name: "Browser + Chrome extension", parts: ["Research feed", "Pitch Audit", "Live Room", "Event Impact", "Meet and Zoom captions"], tone: "ink" },
  { name: "Next.js API", parts: ["streaming responses"], tone: "ink" },
  { name: "Brain", parts: ["Claude", "plan", "write", "verify", "judge"], tone: "ink" },
  { name: "Search layer", parts: ["Telem routing", "Telem monitors", "Tavily search", "Tavily extract"], tone: "cobalt" },
  { name: "Memory", parts: ["verified-yield engine board", "topic memory", "query hints", "trained ranker"], tone: "pursue" },
] as const;

function Stack() {
  return (
    <section id="stack" className="w-full">
      <Title lede="Five layers. The bottom one is written only by what the layer above it could prove.">What runs under it</Title>
      <div className="mx-auto max-w-[1300px]">
        {LAYERS.map((l, i) => {
          const border = l.tone === "cobalt" ? "border-cobalt bg-cobalt-soft" : l.tone === "pursue" ? "border-pursue bg-pursue-soft" : "border-ink/70 bg-surface";
          const text = l.tone === "cobalt" ? "text-cobalt" : l.tone === "pursue" ? "text-pursue" : "text-ink";
          return (
            <div key={l.name}>
              {i > 0 && (
                <svg viewBox="0 0 20 34" className="mx-auto block h-[34px] w-5" aria-hidden="true">
                  <line x1="10" y1="0" x2="10" y2="24" stroke={INK} strokeWidth="2" />
                  <path d="M3 22 L10 33 L17 22 z" fill={INK} />
                </svg>
              )}
              <div className={`grid grid-cols-[22rem_minmax(0,1fr)] items-center gap-8 rounded-[8px] border-2 px-8 py-6 ${border}`}>
                <p className={`serif text-[2rem] font-semibold leading-tight ${text}`}>{l.name}</p>
                <div className="flex flex-wrap gap-2">
                  {l.parts.map((p) => (
                    <span key={p} className={`rounded-[8px] border bg-surface px-3 py-1.5 font-mono text-[1rem] ${l.tone === "ink" ? "border-rule text-graphite" : `border-current ${text}`}`}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const SECTIONS = { flow: Flow, compare: Compare, stack: Stack } as const;

function HowInner() {
  const only = useSearchParams().get("section") as keyof typeof SECTIONS | null;
  if (only && SECTIONS[only]) {
    const S = SECTIONS[only];
    return (
      <div className="fixed inset-0 z-[100] flex min-h-screen items-center overflow-auto bg-paper px-20 py-14 text-ink">
        <div className="mx-auto w-full max-w-[1760px]">
          <S />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-28 pb-20">
      <Flow />
      <Compare />
      <Stack />
    </div>
  );
}

export default function HowPage() {
  return (
    <Suspense fallback={null}>
      <HowInner />
    </Suspense>
  );
}
