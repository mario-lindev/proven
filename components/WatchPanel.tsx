"use client";

import { useEffect, useState } from "react";
import type { Watch } from "@/lib/types";
import ErrorBox from "./ErrorBox";
import { api, errMsg, fmtTime } from "./http";

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
    <section className="rounded-2xl border border-line p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold">Watch</h3>
          <p className="text-muted">
            {watch
              ? `Tracking ${watch.company}. Checks every 30 seconds${checkedAt ? `, last at ${checkedAt.toLocaleTimeString()}` : ""}.`
              : "Keep tracking this company and report what changes."}
          </p>
        </div>
        {!watch && (
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="rounded-xl border-2 border-accent px-5 py-2.5 font-semibold text-accent hover:bg-accent-soft disabled:opacity-60"
          >
            {starting ? "Starting..." : "Watch this company"}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}

      {watch && (
        <div className="mt-5">
          {watch.updates.length === 0 ? (
            <p className="text-muted">No updates yet. New results will appear here.</p>
          ) : (
            <ul className="divide-y divide-line">
              {[...watch.updates].reverse().map((u, i) => (
                <li key={`${u.url}-${i}`} className="py-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold hover:underline"
                    >
                      {u.title}
                    </a>
                    <span className="shrink-0 text-sm text-muted">{fmtTime(u.at)}</span>
                  </div>
                  <p className="mt-1 text-muted">{u.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
