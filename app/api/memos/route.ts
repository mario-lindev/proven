import { NextResponse } from "next/server";
import { listMemos } from "@/lib/store";
import type { MemoSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const memos: MemoSummary[] = listMemos().map((m) => ({
    id: m.id,
    company: m.company,
    verdict: m.verdict,
    confidence: m.confidence,
    summary: m.summary,
    created_at: m.created_at,
    n_sources: m.sources.length,
  }));
  return NextResponse.json({ memos });
}
