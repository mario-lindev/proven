"use client";

import { useEffect, useRef, useState } from "react";
import type { Watch } from "@/lib/types";
import ErrorBox from "./ErrorBox";
import { api, domain, errMsg, timeAgo } from "./http";

const POLL_MS = 30_000;

export default function WatchPanel({ company }: { company: string }) {
  const [watch, setWatch] = useState<Watch | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const startRequest = useRef<AbortController>(null);
  const watchId = watch?.id;

  useEffect(() => () => startRequest.current?.abort(), []);

  useEffect(() => {
    if (!watchId) return;
    const controller = new AbortController();
    const path = `/api/watch/${encodeURIComponent(watchId)}`;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const updated = await api<Watch>(path, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setWatch((previous) => previous && { ...updated, company: previous.company });
        setError(null);
        setCheckedAt(new Date());
      } catch (error) {
        if (!controller.signal.aborted) setError(errMsg(error));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, POLL_MS);
      }
    }

    timer = setTimeout(poll, POLL_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [watchId]);

  async function start() {
    if (startRequest.current) return;
    const controller = new AbortController();
    startRequest.current = controller;
    setStarting(true);
    setError(null);
    try {
      const created = await api<Watch>("/api/watch", { company }, controller.signal);
      if (controller.signal.aborted) return;
      setWatch(created);
      setCheckedAt(new Date());
    } catch (error) {
      if (!controller.signal.aborted) setError(errMsg(error));
    } finally {
      startRequest.current = null;
      if (!controller.signal.aborted) setStarting(false);
    }
  }

  const updates = [...new Map(watch?.updates.map((entry) => [
    JSON.stringify([entry.at, entry.url, entry.title]), entry,
  ])).values()].sort((first, second) => second.at.localeCompare(first.at));

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
          {updates.length === 0 ? (
            <p className="border-t border-rule-soft pt-3 text-sm text-graphite">No changes yet. New coverage will show up here.</p>
          ) : (
            <ul className="divide-y divide-rule-soft border-t border-rule-soft">
              {updates.map((u) => (
                <li key={JSON.stringify([u.at, u.url, u.title])} className="row-in py-3">
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
          <p className="mt-2 text-xs text-faint">
            Monitor <span className="font-mono">{watch.monitor_id}</span>
          </p>
        </div>
      )}
    </section>
  );
}
