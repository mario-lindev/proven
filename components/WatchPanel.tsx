"use client";

import { useEffect, useRef, useState } from "react";
import type { Watch } from "@/lib/types";
import SourceLink from "@/components/SourceLink";
import ErrorBox from "./ErrorBox";
import { api, errMsg, fmtTime } from "./http";

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
        setWatch((current) => current && { ...updated, company: current.company });
        setError(null);
        setCheckedAt(new Date());
      } catch (e) {
        if (!controller.signal.aborted) setError(errMsg(e));
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
      if (!controller.signal.aborted) {
        setWatch(created);
        setCheckedAt(new Date());
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(errMsg(e));
    } finally {
      startRequest.current = null;
      if (!controller.signal.aborted) setStarting(false);
    }
  }

  const updates = [...new Map(watch?.updates.map((entry) => [`${entry.at}|${entry.url}|${entry.title}`, entry])).values()]
    .sort((first, second) => second.at.localeCompare(first.at));

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
          {updates.length === 0 ? (
            <p className="text-muted">No updates yet. New results will appear here.</p>
          ) : (
            <ul className="divide-y divide-line">
              {updates.map((u) => (
                <li key={`${u.at}|${u.url}|${u.title}`} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <SourceLink url={u.url}
                      className="font-semibold hover:underline"
                    >
                      {u.title}
                    </SourceLink>
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
