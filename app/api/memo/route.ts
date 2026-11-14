import { NextResponse } from "next/server";
import { buildMemo } from "@/lib/brain/memo";
import { fail, fixture } from "@/lib/api";
import { isMock } from "@/lib/mock";
import type { Memo } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { company, context, depth } = (await req.json()) as { company?: string; context?: string; depth?: "quick" | "deep" };
    if (!company?.trim()) return fail("company is required", 400);
    if (isMock()) return NextResponse.json({ ...(await fixture<Memo>("memo")), company });
    return NextResponse.json(await buildMemo(company.trim(), context, depth === "quick" ? "quick" : "deep"));
  } catch (e) {
    return fail(e);
  }
}
