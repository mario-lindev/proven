"use client";

import type { Source } from "@/lib/types";

export default function SourceChip({
  n,
  source,
  onClick,
}: {
  n: number;
  source: Source;
  onClick: () => void;
}) {
  return (
    <span className="group relative inline-block align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="ml-1 rounded-md border border-line bg-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
        aria-label={`Source ${n}: ${source.title}`}
      >
        [{n}]
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-72 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-sm text-white shadow-lg group-hover:block">
        <span className="block font-medium leading-snug">{source.title}</span>
        <span className="mt-1 block text-xs uppercase tracking-wide text-white/70">via {source.engine}</span>
      </span>
    </span>
  );
}
