"use client";

import SourceLink from "@/components/SourceLink";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClaimCheck } from "@/lib/types";
import ErrorBox from "@/components/ErrorBox";
import TrailDrawer from "@/components/TrailDrawer";
import { EngineDot, engineLabel } from "@/components/engines";
import { api, domain, errMsg } from "@/components/http";

// Minimal Web Speech API types (not in TypeScript's DOM lib).
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: { length: number; [i: number]: SpeechResult } };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const VERDICT: Record<ClaimCheck["verdict"], { label: string; text: string; bg: string; line: string; mark: string }> = {
  supported: { label: "Checks out", text: "text-pursue", bg: "bg-pursue-soft", line: "border-pursue", mark: "bg-pursue-soft decoration-pursue" },
  contradicted: { label: "Contradicted", text: "text-pass", bg: "bg-pass-soft", line: "border-pass", mark: "bg-pass-soft decoration-pass" },
  unclear: { label: "Unclear", text: "text-dig", bg: "bg-dig-soft", line: "border-dig", mark: "bg-dig-soft decoration-dig" },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
const words = (s: string) => new Set(norm(s).split(/\s+/).filter((w) => w.length > 2));

// The check whose claim best matches this transcript line, if most of the claim's words are in it.
function matchCheck(line: string, checks: ClaimCheck[]) {
  const lw = words(line);
  let best: ClaimCheck | null = null;
  let bestScore = 0;
  for (const c of checks) {
    const cw = words(c.claim);
    if (cw.size === 0) continue;
    let hit = 0;
    for (const w of cw) if (lw.has(w)) hit++;
    const score = hit / cw.size;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

type LogLine = { text: string; typed: boolean };

export default function LiveRoom() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [interim, setInterim] = useState("");
  const [checks, setChecks] = useState<ClaimCheck[]>([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [typedBusy, setTypedBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [typed, setTyped] = useState("");
  const [trailId, setTrailId] = useState<string | null>(null);

  const recRef = useRef<Recognition | null>(null);
  const listeningRef = useRef(false);
  const finalsRef = useRef<string[]>([]);
  const inFlight = useRef(new Map<string, AbortController>());
  const scrollRef = useRef<HTMLDivElement>(null);

  const closeTrail = useCallback(() => setTrailId(null), []);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || inFlight.current.has(t)) return false;
    const controller = new AbortController();
    inFlight.current.set(t, controller);
    setNotice("");
    setError(null);
    setPending((p) => p + 1);
    try {
      const { checks: found } = await api<{ checks: ClaimCheck[] }>("/api/live", { text: t }, controller.signal);
      if (controller.signal.aborted) return false;
      if (found?.length) {
        setChecks((prev) => {
          const latest = new Map(found.map((claim) => [norm(claim.claim), claim]));
          return [...latest.values(), ...prev.filter((claim) => !latest.has(norm(claim.claim)))];
        });
      } else {
        setNotice("No new checkable claims returned.");
      }
      return true;
    } catch (e) {
      if (!controller.signal.aborted) setError(errMsg(e));
      return false;
    } finally {
      inFlight.current.delete(t);
      if (!controller.signal.aborted) setPending((p) => p - 1);
    }
  }, []);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    setSupported(!!(w.webkitSpeechRecognition || w.SpeechRecognition));
    const requests = inFlight.current;
    return () => {
      listeningRef.current = false;
      const recognition = recRef.current;
      recRef.current = null;
      recognition?.abort();
      for (const controller of requests.values()) controller.abort();
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, interim]);

  function start() {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      if (recRef.current !== rec) return;
      let live = "";
      let gotFinal = false;
      const newFinals: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0].transcript.trim();
        if (r.isFinal) {
          if (txt) {
            finalsRef.current = [...finalsRef.current.slice(-1), txt];
            newFinals.push(txt);
            gotFinal = true;
          }
        } else {
          live += r[0].transcript;
        }
      }
      setInterim(live);
      if (gotFinal) {
        setLog((l) => [...l, ...newFinals.map((text) => ({ text, typed: false }))]);
        send(finalsRef.current.slice(-2).join(" "));
      }
    };
    rec.onerror = (e) => {
      if (recRef.current !== rec) return;
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        listeningRef.current = false;
        setListening(false);
        setError("Microphone access was blocked. Allow the mic for this site, or type a claim below.");
        return;
      }
      setError(`Speech recognition error: ${e.error}`);
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      recRef.current = null;
      listeningRef.current = false;
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    finalsRef.current = [];
    listeningRef.current = true;
    setListening(true);
    setError(null);
    try {
      rec.start();
    } catch (e) {
      recRef.current = null;
      listeningRef.current = false;
      setListening(false);
      setError(errMsg(e));
    }
  }

  function stop() {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    recRef.current?.stop();
  }

  async function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text || typedBusy) return;
    setTypedBusy(true);
    if (await send(text)) {
      setLog((previous) => [...previous, { text, typed: true }]);
      setTyped((current) => current.trim() === text ? "" : current);
    }
    setTypedBusy(false);
  }

  const counts = {
    contradicted: checks.filter((c) => c.verdict === "contradicted").length,
    unclear: checks.filter((c) => c.verdict === "unclear").length,
    supported: checks.filter((c) => c.verdict === "supported").length,
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="serif text-[3.4rem] font-semibold leading-none tracking-tight">Live Room</h1>
          <p className="mt-3 max-w-[38rem] text-[1.15rem] text-graphite">
            Proven listens to the pitch and checks each factual claim against the web while the founder is still talking.
          </p>
        </div>
        <div className="flex items-center gap-5">
          {listening && (
            <span className="flex items-center gap-3 text-lg font-medium text-pass" role="status">
              <span className="flex h-6 items-end gap-[3px]" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="level-bar w-[4px] bg-pass" style={{ height: "100%", animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
              Listening
            </span>
          )}
          {supported !== false && (
            <button
              type="button"
              onClick={listening ? stop : start}
              disabled={supported === null}
              className={`flex items-center gap-3 px-8 py-4 text-xl font-semibold text-white disabled:opacity-50 ${
                listening ? "bg-pass hover:bg-pass/85" : "bg-ink hover:bg-cobalt"
              }`}
            >
              <span className={`h-3 w-3 rounded-full ${listening ? "bg-white" : "bg-pass"}`} aria-hidden />
              {listening ? "Stop listening" : "Start listening"}
            </button>
          )}
        </div>
      </header>

      {supported === false && (
        <div className="border-l-4 border-dig bg-dig-soft px-5 py-4">
          <span className="font-semibold text-dig">Use Chrome for the mic.</span> This browser has no speech recognition.
          You can still type claims below.
        </div>
      )}

      {error && <ErrorBox message={error} />}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby="transcript-title" className="flex min-w-0 flex-col border border-rule bg-surface">
          <div className="flex items-baseline justify-between border-b border-rule px-6 py-3">
            <h2 id="transcript-title" className="font-semibold">
              Transcript
            </h2>
            <span className="text-sm text-graphite">Checked claims are marked in their verdict colour</span>
          </div>
          <div ref={scrollRef} className="h-[46vh] min-h-[18rem] overflow-y-auto px-6 py-5" aria-live="off">
            {log.length === 0 && !interim ? (
              <p className="serif text-[1.5rem] leading-relaxed text-faint">
                {listening ? "Listening. Start the pitch." : "Press Start listening and begin the pitch, or type a claim below."}
              </p>
            ) : (
              <p className="serif text-[1.6rem] leading-[1.6]">
                {log.slice(-30).map((l, i) => {
                  const c = matchCheck(l.text, checks);
                  const v = c ? VERDICT[c.verdict] ?? VERDICT.unclear : null;
                  return (
                    <span key={i}>
                      {v ? (
                        <mark
                          className={`rounded-[2px] px-1 text-ink underline decoration-2 underline-offset-[6px] ${v.mark}`}
                          title={`${v.label}: ${c?.note}`}
                        >
                          {l.text}
                        </mark>
                      ) : (
                        <span className={l.typed ? "text-graphite" : ""}>{l.text}</span>
                      )}{" "}
                    </span>
                  );
                })}
                <span className="text-faint">{interim}</span>
              </p>
            )}
          </div>
          <form onSubmit={submitTyped} className="flex border-t border-rule">
            <label htmlFor="typed" className="sr-only">
              Type a claim to check
            </label>
            <input
              id="typed"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type a claim to check, e.g. We have no competitors"
              className="min-w-0 flex-1 bg-transparent px-6 py-4 text-lg outline-none placeholder:text-faint"
            />
            <button
              type="submit"
              disabled={!typed.trim() || typedBusy}
              className="shrink-0 border-l border-rule px-7 text-lg font-semibold text-ink hover:bg-ink hover:text-white disabled:text-faint disabled:hover:bg-transparent"
            >
              {typedBusy ? "Checking…" : "Check"}
            </button>
          </form>
        </section>

        <section aria-labelledby="claims-title" className="min-w-0">
          <div className="mb-4 flex items-baseline justify-between border-b-2 border-ink pb-2">
            <h2 id="claims-title" className="text-lg font-semibold">
              Claims checked
            </h2>
            <span className="tnum flex gap-4 text-sm">
              <span className="text-pass">{counts.contradicted} contradicted</span>
              <span className="text-dig">{counts.unclear} unclear</span>
              <span className="text-pursue">{counts.supported} check out</span>
            </span>
          </div>

          <div className="space-y-4" aria-live="polite">
            {pending > 0 && (
              <div className="flex items-center gap-3 border border-dashed border-cobalt/50 bg-cobalt-soft px-5 py-4 text-cobalt">
                <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-cobalt" aria-hidden />
                Searching the web for the latest claim
              </div>
            )}
            {notice && <p className="text-graphite">{notice}</p>}
            {checks.length === 0 && pending === 0 && !notice && !error && (
              <p className="text-lg text-graphite">
                No claims yet. When the founder states a fact, its check appears here with sources.
              </p>
            )}
            {checks.map((c) => {
              const v = VERDICT[c.verdict] ?? VERDICT.unclear;
              return (
                <article key={c.id + c.claim} className={`row-in border-l-[6px] ${v.line} bg-surface px-6 py-5 shadow-[0_1px_0_#d8dee4]`}>
                  <p className={`text-2xl font-semibold ${v.text}`}>{v.label}</p>
                  <p className="serif mt-2 text-[1.45rem] font-medium leading-snug">&ldquo;{c.claim}&rdquo;</p>
                  <p className="mt-2 text-lg leading-snug">{c.note}</p>
                  {c.sources.length > 0 && (
                    <ul className="mt-4 space-y-1.5 border-t border-rule-soft pt-3">
                      {c.sources.map((s, i) => (
                        <li key={s.id} className="grid grid-cols-[1.4rem_minmax(0,1fr)] gap-1">
                          <span className="tnum text-sm font-semibold text-cobalt">{i + 1}</span>
                          <div className="min-w-0">
                            <SourceLink url={s.url} className="font-medium hover:underline">
                              {s.title}
                            </SourceLink>
                            <p className="flex items-center gap-1.5 truncate text-sm text-graphite">
                              <EngineDot name={s.engine} />
                              {engineLabel(s.engine)}, {domain(s.url)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => setTrailId(c.trail_id)}
                    className="mt-4 font-medium text-cobalt hover:underline"
                  >
                    See the searches behind this
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <TrailDrawer trailId={trailId} onClose={closeTrail} />
    </div>
  );
}
