import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { train } from "@/lib/ml";
import { isMock } from "@/lib/mock";

export const dynamic = "force-dynamic";

// A logistic regression trained on request on Proven's own outcomes: which search results backed a verified line.
export async function GET() {
  try {
    if (isMock()) return NextResponse.json({ ready: false, reason: "demo data" });
    return NextResponse.json(train());
  } catch (e) {
    return fail(e);
  }
}
