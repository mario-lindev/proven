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
    <span className="inline-block align-middle">
      <button
        type="button"
        onClick={onClick}
        className="ml-1 rounded-md border border-line bg-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
        aria-label={`Source ${n}: ${source.title} via ${source.engine}`}
        title={`${source.title} · ${source.engine}`}
      >
        [{n}]
      </button>

    </span>
  );
}
