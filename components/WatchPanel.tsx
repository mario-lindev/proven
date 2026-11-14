"use client";

import { useEffect, useState } from "react";
import type { Watch } from "@/lib/types";
import ErrorBox from "./ErrorBox";
import { api, domain, errMsg, timeAgo } from "./http";

const POLL_MS = 30_000;

export default function WatchPanel({ company }: { company: string }) {
  const [watch, setWatch] = useState<Watch | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const watchId = watch?.id;
  useEffect(() => {
    if (!watchId) return;
    const t = setInterval(() => {
      api<Watch>(`/api/watch/${encodeURIComponent(watchId)}`)
        .then((w) => {
          setWatch(w);
          setError(null);
          setCheckedAt(new Date());
        })
        .catch((e) => setError(errMsg(e)));
    }, POLL_MS);
    return () => clearInterval(t);
  }, [watchId]);

  const [running, setRunning] = useState(false);

  // Run the Telem monitor's agent now, then read what it found a few seconds later.
  async function checkNow() {
    if (!watch) return;
    setRunning(true);
    setError(null);
    const url = `/api/watch/${encodeURIComponent(watch.id)}`;
    try {
      setWatch(await api<Watch>(url, {}));
      await new Promise((r) => setTimeout(r, 6000));
      setWatch(await api<Watch>(url));
      setCheckedAt(new Date());
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setRunning(false);
    }
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      setWatch(await api<Watch>("/api/watch", { company }));
      setCheckedAt(new Date());
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="border border-rule bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            {watch && <span className="pulse-dot h-2 w-2 rounded-full bg-pursue" aria-hidden />}
            {watch ? `Watching ${watch.company}` : "Watch this company"}
          </h3>
          <p className="mt-1 text-sm text-graphite">
            {watch
              ? `A Telem monitor reports new coverage. Checked ${checkedAt ? checkedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "now"}, again every 30 s.`
              : "A Telem monitor keeps searching and reports what changes."}
          </p>
        </div>
      </div>

      {!watch && (
        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="mt-4 w-full rounded-md border-2 border-ink px-4 py-2 font-semibold hover:bg-ink hover:text-white disabled:opacity-60"
        >
          {starting ? "Starting the watch" : "Watch this company"}
        </button>
      )}

      {error && (
        <div className="mt-4">
          <ErrorBox message={error} onRetry={watch ? undefined : start} />
        </div>
      )}

      {watch && (
        <div className="mt-4">
          {watch.updates.length === 0 ? (
            <p className="border-t border-rule-soft pt-3 text-sm text-graphite">No changes yet. New coverage will show up here.</p>
          ) : (
            <ul className="divide-y divide-rule-soft border-t border-rule-soft">
              {[...watch.updates].reverse().map((u, i) => (
                <li key={`${u.url}-${i}`} className="row-in py-3">
                  <a href={u.url} target="_blank" rel="noopener noreferrer" className="font-medium leading-snug hover:underline">
                    {u.title}
                  </a>
                  <p className="mt-0.5 text-sm text-graphite">
                    {domain(u.url)}, {timeAgo(u.at)}
                  </p>
                  {u.summary && <p className="mt-1 text-sm">{u.summary}</p>}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={checkNow}
            disabled={running}
            className="mt-3 w-full rounded-md border border-ink px-4 py-1.5 text-sm font-semibold hover:bg-ink hover:text-white disabled:opacity-60"
          >
            {running ? "Telem agent is checking" : "Check now"}
          </button>
          <p className="mt-2 text-xs text-faint">
            Monitor <span className="font-mono">{watch.monitor_id}</span>
          </p>
        </div>
      )}
    </section>
  );
}
