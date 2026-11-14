"use client";

import { useId, useState } from "react";
import type { Source } from "@/lib/types";
import { EngineDot, engineLabel, isTavily } from "./engines";
import { domain, fmtDate } from "./http";

// A numbered citation. Hover or focus previews the source; click opens the trail at that source.
export default function SourceChip({
  n,
  source,
  onClick,
}: {
  n: number;
  source: Source;
  onClick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="relative inline-block align-baseline"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        aria-describedby={open ? id : undefined}
        aria-label={`Source ${n}: ${source.title}`}
        className="tnum relative -top-[0.2em] ml-1 inline-flex h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-[3px] border border-cobalt/30 bg-cobalt-soft px-1 font-sans text-[0.72rem] font-semibold text-cobalt transition-colors hover:border-cobalt hover:bg-cobalt hover:text-white"
      >
        {n}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="no-print absolute bottom-full left-1/2 z-30 mb-2 block w-[22rem] -translate-x-1/2 border border-rule bg-surface p-4 text-left font-sans shadow-[0_12px_32px_-12px_rgba(20,32,43,0.35)]"
        >
          <span className="flex items-center justify-between gap-3 text-sm text-graphite">
            <span className="truncate">{domain(source.url)}</span>
            {source.published && <span className="tnum shrink-0">{fmtDate(source.published)}</span>}
          </span>
          <span className="serif mt-1.5 block text-[1.05rem] font-semibold leading-snug text-ink">{source.title}</span>
          {source.snippet && (
            <span className="mt-2 line-clamp-3 block text-sm leading-relaxed text-graphite">{source.snippet}</span>
          )}
          <span className="mt-3 flex items-center gap-1.5 border-t border-rule-soft pt-2.5 text-sm">
            <EngineDot name={source.engine} />
            <span className="font-medium text-ink">{engineLabel(source.engine)}</span>
            <span className="text-graphite">{isTavily(source.engine) ? "search found this" : "found this, routed by Telem"}</span>
          </span>
        </span>
      )}
    </span>
  );
}
