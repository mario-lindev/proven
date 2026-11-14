import { NextResponse } from "next/server";
import { fail, fixture } from "@/lib/api";
import { isMock } from "@/lib/mock";
import { store } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isMock()) return NextResponse.json(await fixture("trail"));
  const trail = store.trails.get(id);
  return trail ? NextResponse.json(trail) : fail(`trail ${id} not found`, 404);
}
