import { NextResponse } from "next/server";
import { fail, fixture } from "@/lib/api";
import { isMock } from "@/lib/mock";
import { getTrail } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trail = getTrail(id);
  if (trail) return NextResponse.json(trail);
  if (isMock()) return NextResponse.json(await fixture("trail"));
  return fail(`trail ${id} not found`, 404);
}
