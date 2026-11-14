"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClaimCheck } from "@/lib/types";
import SourceLink from "@/components/SourceLink";
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
  onstart: (() => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const VERDICT: Record<ClaimCheck["verdict"], { label: string; card: string; text: string }> = {
  supported: { label: "Checks out", card: "border-green-700 bg-green-50", text: "text-green-800" },
  contradicted: { label: "Contradicted", card: "border-red-700 bg-red-50", text: "text-red-800" },
  unclear: { label: "Unclear", card: "border-amber-500 bg-amber-50", text: "text-amber-800" },
};

const norm = (s: string) => s.normalize("NFKC").toLowerCase().trim().replace(/[.!?]+$/, "");

export default function LiveRoom() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [mic, setMic] = useState<"idle" | "starting" | "listening" | "stopping">("idle");
  const listening = mic === "listening";
  const [finals, setFinals] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [checks, setChecks] = useState<ClaimCheck[]>([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [typedBusy, setTypedBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [micError, setMicError] = useState("");
  const [typed, setTyped] = useState("");
  const [trailId, setTrailId] = useState<string | null>(null);

  const recRef = useRef<Recognition | null>(null);
  const finalsRef = useRef<string[]>([]);
  const inFlight = useRef(new Map<string, AbortController>());

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
      const recognizer = recRef.current;
      recRef.current = null;
      recognizer?.abort();
      for (const controller of requests.values()) controller.abort();
    };
  }, []);

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
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0].transcript.trim();
        if (r.isFinal) {
          if (txt) {
            finalsRef.current = [...finalsRef.current.slice(-11), txt];
            gotFinal = true;
          }
        } else {
          live += r[0].transcript;
        }
      }
      setInterim(live);
      if (gotFinal) {
        setFinals(finalsRef.current);
        void send(finalsRef.current.slice(-2).join("\n"));
      }
    };
    rec.onstart = () => {
      if (recRef.current === rec) setMic("listening");
    };
    rec.onerror = ({ error }) => {
      if (recRef.current !== rec || error === "aborted" || error === "no-speech") return;
      setMicError(error === "not-allowed" || error === "service-not-allowed"
        ? "Microphone access was blocked. Allow access for this site or type a claim below."
        : `Speech recognition error: ${error}. You can type a claim below.`);
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      recRef.current = null;
      setMic("idle");
      setInterim("");
    };
    recRef.current = rec;
    finalsRef.current = [];
    setMic("starting");
    setMicError("");
    try {
      rec.start();
      setFinals([]);
    } catch (e) {
      recRef.current = null;
      setMic("idle");
      setMicError(errMsg(e));
    }
  }

  function stop() {
    const recognizer = recRef.current;
    if (!recognizer) return;
    setMic("stopping");
    recognizer.stop();
  }

  async function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text || typedBusy) return;
    setTypedBusy(true);
    if (await send(text)) setTyped((current) => current.trim() === text ? "" : current);
    setTypedBusy(false);
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Live Room</h1>
          <p className="mt-3 max-w-2xl text-xl text-muted">
            Proven listens to the pitch and checks each factual claim as it is spoken.
          </p>
        </div>
        {supported !== false && (
          <button
            type="button"
            onClick={listening ? stop : start}
            disabled={supported === null || mic === "starting" || mic === "stopping"}
            className={`flex items-center gap-3 rounded-xl px-8 py-4 text-xl font-semibold text-white disabled:opacity-50 ${
              listening ? "bg-red-700 hover:bg-red-800" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {listening && <span className="h-3 w-3 animate-pulse rounded-full bg-white" />}
            {({ idle: "Start listening", starting: "Starting…", listening: "Stop listening", stopping: "Stopping…" })[mic]}
          </button>
        )}
      </header>

      {supported === false && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900">
          <span className="font-semibold">Use Chrome for the mic.</span> This browser has no speech recognition. You
          can still type claims below.
        </div>
      )}

      {micError && <ErrorBox message={micError} />}

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
          disabled={!typed.trim() || typedBusy}
          className="rounded-xl bg-accent px-6 py-3 text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {typedBusy ? "Checking…" : "Check claim"}
        </button>
      </form>

      {error && <ErrorBox message={error} />}

      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Claims</h2>
          {pending > 0 && <span className="text-muted" role="status">Checking…</span>}
        </div>
        {notice && <p className="text-muted" role="status">{notice}</p>}
        {checks.length === 0 && pending === 0 && !notice && !error && (
          <p className="text-lg text-muted">No claims checked yet.</p>
        )}
        {checks.map((c) => {
          const v = VERDICT[c.verdict] ?? VERDICT.unclear;
          return (
            <article key={c.id + c.claim} className={`rounded-xl border p-5 sm:p-6 ${v.card}`}>
              <div className={`text-3xl font-bold ${v.text}`}>{v.label}</div>
              <p className="mt-3 break-words text-xl font-medium leading-snug sm:text-2xl">&ldquo;{c.claim}&rdquo;</p>
              <p className="mt-2 text-lg">{c.note}</p>
              {c.sources.length > 0 && (
                <ul className="mt-4 space-y-1">
                  {c.sources.map((s, i) => (
                    <li key={s.id} className="text-base">
                      <span className="mr-2 font-mono text-sm font-semibold text-accent">[{i + 1}]</span>
                      <SourceLink url={s.url} className="hover:underline">
                        {s.title}
                      </SourceLink>
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
