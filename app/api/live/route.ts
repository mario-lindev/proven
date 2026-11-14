import { NextResponse } from "next/server";
import { checkText } from "@/lib/brain/live";
import { fail, fixture } from "@/lib/api";
import { isMock } from "@/lib/mock";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { text, context } = (await req.json()) as { text?: string; context?: string };
    if (!text?.trim()) return NextResponse.json({ checks: [] });
    if (isMock()) {
      const hit = /competitor/i.test(text);
      return NextResponse.json(hit ? await fixture("live") : { checks: [] });
    }
    return NextResponse.json({ checks: await checkText(text, context?.trim() || undefined) });
  } catch (e) {
    return fail(e);
  }
}
