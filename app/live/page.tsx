"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClaimCheck } from "@/lib/types";
import ErrorBox from "@/components/ErrorBox";
import TrailDrawer from "@/components/TrailDrawer";
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
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const VERDICT: Record<ClaimCheck["verdict"], { label: string; card: string; text: string }> = {
  supported: { label: "Checks out", card: "border-green-700 bg-green-50", text: "text-green-800" },
  contradicted: { label: "Contradicted", card: "border-red-700 bg-red-50", text: "text-red-800" },
  unclear: { label: "Unclear", card: "border-amber-500 bg-amber-50", text: "text-amber-800" },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

export default function LiveRoom() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [finals, setFinals] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [checks, setChecks] = useState<ClaimCheck[]>([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [trailId, setTrailId] = useState<string | null>(null);

  const recRef = useRef<Recognition | null>(null);
  const listeningRef = useRef(false);
  const finalsRef = useRef<string[]>([]);
  const inFlight = useRef(new Set<string>());

  const closeTrail = useCallback(() => setTrailId(null), []);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || inFlight.current.has(t)) return;
    inFlight.current.add(t);
    setPending((p) => p + 1);
    try {
      const { checks: found } = await api<{ checks: ClaimCheck[] }>("/api/live", { text: t });
      setError(null);
      if (found?.length) {
        setChecks((prev) => {
          const seen = new Set(prev.map((c) => norm(c.claim)));
          const fresh = found.filter((c) => !seen.has(norm(c.claim)));
          return [...fresh.reverse(), ...prev];
        });
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      inFlight.current.delete(t);
      setPending((p) => p - 1);
    }
  }, []);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    setSupported(!!(w.webkitSpeechRecognition || w.SpeechRecognition));
    return () => {
      listeningRef.current = false;
      recRef.current?.stop();
    };
  }, []);

  function start() {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let live = "";
      let gotFinal = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0].transcript.trim();
        if (r.isFinal) {
          if (txt) {
            finalsRef.current = [...finalsRef.current, txt];
            gotFinal = true;
          }
        } else {
          live += r[0].transcript;
        }
      }
      setInterim(live);
      if (gotFinal) {
        setFinals(finalsRef.current);
        send(finalsRef.current.slice(-2).join(" "));
      }
    };
    rec.onerror = (e) => {
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
      if (listeningRef.current) {
        try {
          rec.start();
        } catch {
          // already started
        }
      }
    };
    recRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    setError(null);
    try {
      rec.start();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  function stop() {
    listeningRef.current = false;
    setListening(false);
    setInterim("");
    recRef.current?.stop();
  }

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    if (!typed.trim()) return;
    send(typed);
    setTyped("");
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl font-semibold tracking-tight">Live Room</h1>
          <p className="mt-3 max-w-2xl text-xl text-muted">
            Proven listens to the pitch and checks each factual claim as it is spoken.
          </p>
        </div>
        {supported !== false && (
          <button
            type="button"
            onClick={listening ? stop : start}
            disabled={supported === null}
            className={`flex items-center gap-3 rounded-xl px-8 py-4 text-xl font-semibold text-white disabled:opacity-50 ${
              listening ? "bg-red-700 hover:bg-red-800" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {listening && <span className="h-3 w-3 animate-pulse rounded-full bg-white" />}
            {listening ? "Stop" : "Start listening"}
          </button>
        )}
      </header>

      {supported === false && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900">
          <span className="font-semibold">Use Chrome for the mic.</span> This browser has no speech recognition. You
          can still type claims below.
        </div>
      )}

      <section className="min-h-32 rounded-2xl border border-line bg-soft p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Transcript</h2>
        {finals.length === 0 && !interim ? (
          <p className="text-lg text-muted">{listening ? "Listening..." : "Press Start listening and begin the pitch."}</p>
        ) : (
          <p className="text-xl leading-relaxed">
            {finals.slice(-12).join(" ")} <span className="text-muted/70">{interim}</span>
          </p>
        )}
      </section>

      <form onSubmit={submitTyped} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or type a claim"
          aria-label="Or type a claim"
          className="min-w-0 flex-1 rounded-xl border-2 border-line px-5 py-3 text-lg outline-none placeholder:text-muted/60 focus:border-accent"
        />
        <button
          type="submit"
          disabled={!typed.trim()}
          className="rounded-xl bg-accent px-6 py-3 text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Check
        </button>
      </form>

      {error && <ErrorBox message={error} />}

      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Claims</h2>
          {pending > 0 && <span className="animate-pulse text-muted">Checking...</span>}
        </div>
        {checks.length === 0 && pending === 0 && (
          <p className="text-lg text-muted">No claims checked yet.</p>
        )}
        {checks.map((c) => {
          const v = VERDICT[c.verdict] ?? VERDICT.unclear;
          return (
            <article key={c.id + c.claim} className={`rounded-2xl border-l-8 p-6 ${v.card}`}>
              <div className={`text-3xl font-bold ${v.text}`}>{v.label}</div>
              <p className="mt-3 text-2xl font-medium leading-snug">&ldquo;{c.claim}&rdquo;</p>
              <p className="mt-2 text-lg">{c.note}</p>
              {c.sources.length > 0 && (
                <ul className="mt-4 space-y-1">
                  {c.sources.map((s, i) => (
                    <li key={s.id} className="text-base">
                      <span className="mr-2 font-mono text-sm font-semibold text-accent">[{i + 1}]</span>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {s.title}
                      </a>
                      <span className="ml-2 text-sm text-muted">
                        {domain(s.url)} via {s.engine}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setTrailId(c.trail_id)}
                className="mt-4 font-medium text-accent hover:underline"
              >
                See how
              </button>
            </article>
          );
        })}
      </section>

      <TrailDrawer trailId={trailId} onClose={closeTrail} />
    </div>
  );
}
