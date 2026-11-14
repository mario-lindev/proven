"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Memo } from "@/lib/types";
import ErrorBox from "./ErrorBox";
import MemoView from "./MemoView";
import { api, errMsg } from "./http";

export default function SavedMemo({ id }: { id: string }) {
  const [memo, setMemo] = useState<Memo>();
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<Memo>(`/api/memo/${encodeURIComponent(id)}`, undefined, controller.signal)
      .then(setMemo)
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errMsg(reason));
      });
    return () => controller.abort();
  }, [id]);

  return (
    <div className="space-y-6">
      <Link href="/" className="font-semibold text-accent underline">New research</Link>
      {error ? <ErrorBox message={error} /> : memo ? <MemoView memo={memo} /> : (
        <p className="text-muted" role="status">Loading memo…</p>
      )}
    </div>
  );
}
