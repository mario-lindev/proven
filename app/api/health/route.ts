import { NextResponse } from "next/server";
import { isMock } from "@/lib/mock";

export const dynamic = "force-dynamic";

// Which mode the server is in and which keys are present (never the values).
export async function GET() {
  return NextResponse.json({
    ok: true,
    mock: isMock(),
    keys: {
      telem: !!process.env.TELEM_API_KEY,
      tavily: !!process.env.TAVILY_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
    },
  });
}
