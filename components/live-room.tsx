"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { ClaimCheck } from "@/lib/types";
import { errorMessage, post } from "./client-api";
import { type Evidence, SourceChips, TrailDrawer } from "./trail";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type Recognizer = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognizer;
  webkitSpeechRecognition?: new () => Recognizer;
};

type CheckResult = { order: number; check: ClaimCheck };
const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });
const verdicts = { supported: "Supported", contradicted: "Contradicted", unclear: "Unclear" };

export function LiveRoom({ demo }: { demo: boolean }) {
  const [claim, setClaim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [mic, setMic] = useState<"idle" | "starting" | "listening" | "stopping">("idle");
  const [micError, setMicError] = useState("");
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [pending, setPending] = useState(0);
  const [manualBusy, setManualBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const [evidence, setEvidence] = useState<Evidence>();
  const recognition = useRef<Recognizer>(null);
  const requests = useRef(new Set<AbortController>());
  const nextOrder = useRef(0);
  const previousSentence = useRef("");

  useEffect(() => {
    const active = requests.current;
    return () => {
      const recognizer = recognition.current;
      recognition.current = null;
      recognizer?.abort();
      for (const controller of active) controller.abort();
    };
  }, []);

  async function checkText(text: string) {
    const order = ++nextOrder.current;
    const controller = new AbortController();
    requests.current.add(controller);
    setPending((count) => count + 1);
    setStatus(undefined);
    try {
      const result = await post<{ checks: ClaimCheck[] }>("/api/live", { text }, controller.signal);
      if (result.checks.length) {
        setChecks((previous) => {
          const combined = [...result.checks.map((check) => ({ order, check })), ...previous];
          const seen = new Set<string>();
          return combined.sort((left, right) => right.order - left.order).filter(({ check }) => {
            const key = check.claim.trim().toLowerCase().replace(/[.!?]+$/, "");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        });
      } else if (order === nextOrder.current) {
        setStatus({ text: "No checkable claim found in the latest submission." });
      }
      return true;
    } catch (reason) {
      if (!controller.signal.aborted) setStatus({ text: errorMessage(reason), error: true });
      return false;
    } finally {
      requests.current.delete(controller);
      if (!controller.signal.aborted) setPending((count) => count - 1);
    }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = claim.trim();
    if (!text || manualBusy) return;
    setManualBusy(true);
    if (await checkText(text)) setClaim((current) => current.trim() === text ? "" : current);
    setManualBusy(false);
  }

  function toggleListening() {
    if (recognition.current) {
      setMic("stopping");
      recognition.current.stop();
      return;
    }

    const browser = window as SpeechWindow;
    const SpeechRecognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicError("Speech recognition is unavailable in this browser. Use Chrome or type a claim below.");
      return;
    }

    const recognizer = new SpeechRecognition();
    recognition.current = recognizer;
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = "en-US";
    previousSentence.current = "";
    setMic("starting");
    setMicError("");
    recognizer.onstart = () => {
      if (recognition.current === recognizer) setMic("listening");
    };
    recognizer.onend = () => {
      if (recognition.current !== recognizer) return;
      recognition.current = null;
      setMic("idle");
      setInterim("");
    };
    recognizer.onerror = ({ error }) => {
      if (recognition.current !== recognizer || error === "aborted") return;
      setMicError(`Speech recognition ended (${error}). Try listening again or type a claim below.`);
    };
    recognizer.onresult = ({ resultIndex, results }) => {
      if (recognition.current !== recognizer) return;
      const draft: string[] = [];
      for (let index = resultIndex; index < results.length; index++) {
        const result = results[index];
        const text = result[0].transcript.trim();
        if (!text) continue;
        if (!result.isFinal) {
          draft.push(text);
          continue;
        }
        setTranscript((current) => current ? `${current} ${text}` : text);
        // A final result also closes an utterance when Chrome omits punctuation.
        for (const { segment } of sentenceSegmenter.segment(text)) {
          const sentence = segment.trim();
          if (!sentence) continue;
          void checkText([previousSentence.current, sentence].filter(Boolean).join("\n"));
          previousSentence.current = sentence;
        }
      }
      setInterim(draft.join(" "));
    };
    try {
      recognizer.start();
    } catch (reason) {
      recognition.current = null;
      setMic("idle");
      setMicError(errorMessage(reason));
    }
  }

  return (
    <main className="workspace">
      <section className="intro compact">
        <h1>Live Room</h1>
        <p>Check factual claims while a pitch is happening.</p>
        {demo && <p className="demo-note">Demo mode uses sample evidence. Try “We have no competitors.”</p>}
      </section>
      <div className="live-grid">
        <section className="report live-panel">
          <div className="section-heading">
            <h2>Transcript</h2>
            <button className="primary" type="button" onClick={toggleListening}
              disabled={mic === "starting" || mic === "stopping"}>
              {({ idle: "Start listening", starting: "Starting…", listening: "Stop listening", stopping: "Stopping…" })[mic]}
            </button>
          </div>
          {mic === "listening" && <p className="listening" role="status">Listening</p>}
          {micError && <p className="error" role="alert">{micError}</p>}
          <p className="transcript">
            {transcript}{transcript && interim ? " " : ""}
            {interim && <span className="muted">{interim}</span>}
            {!transcript && !interim && <span className="muted">Start listening to see the transcript here.</span>}
          </p>
          <form onSubmit={submitClaim} className="claim-form">
            <div className="field">
              <label htmlFor="claim">Type a claim</label>
              <textarea id="claim" value={claim} required rows={3} placeholder="We have no competitors."
                onChange={(event) => setClaim(event.target.value)} />
            </div>
            <button className="secondary" disabled={manualBusy || !claim.trim()}>Check claim</button>
          </form>
        </section>
        <section className="claim-results">
          <h2>Claim checks</h2>
          {pending > 0 && <p role="status" className="muted">Checking {pending === 1 ? "a claim" : `${pending} submissions`}…</p>}
          {status && <p className={status.error ? "error" : "muted"} role={status.error ? "alert" : "status"}>{status.text}</p>}
          {!checks.length && !pending && !status && <p className="muted">Checks appear here as you speak or submit a claim.</p>}
          {checks.map(({ check, order }) => (
            <article className="claim-card" key={`${order}-${check.id}`}>
              <span className={`verdict ${check.verdict}`}>{verdicts[check.verdict]}</span>
              <h3>{check.claim}</h3>
              <p>{check.note}</p>
              <div className="claim-evidence">
                <SourceChips sources={check.sources} onSelect={(source) => setEvidence({ trailId: check.trail_id, source })} />
                <button className="text-button" type="button" onClick={() => setEvidence({ trailId: check.trail_id })}>
                  Research trail
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
      {evidence && <TrailDrawer evidence={evidence} onClose={() => setEvidence(undefined)} />}
    </main>
  );
}
