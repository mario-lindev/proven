import { NextResponse } from "next/server";
import { fail, fixture } from "@/lib/api";
import { getBoard } from "@/lib/learn";
import { isMock } from "@/lib/mock";
import type { EngineBoard } from "@/lib/types";

export const dynamic = "force-dynamic";

// What Proven learned: per engine, how often its results end up as verified evidence in memos.
export async function GET() {
  try {
    if (isMock()) return NextResponse.json(await fixture<EngineBoard>("engines"));
    return NextResponse.json(getBoard());
  } catch (e) {
    return fail(e);
  }
}
