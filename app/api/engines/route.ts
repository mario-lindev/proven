import { NextResponse } from "next/server";
import { fail, fixture } from "@/lib/api";
import { getBoard, queryHints } from "@/lib/learn";
import { isMock } from "@/lib/mock";
import type { EngineBoard } from "@/lib/types";

export const dynamic = "force-dynamic";

// What Proven learned: the engine board, plus the loop memory (per-topic engine yield, efficiency history, query hints).
export async function GET() {
  try {
    if (isMock()) return NextResponse.json(await fixture<EngineBoard>("engines"));
    const board = getBoard();
    return NextResponse.json({ ...board, topics: board.topics ?? {}, history: board.history ?? [], hints: queryHints() } satisfies EngineBoard);
  } catch (e) {
    return fail(e);
  }
}
