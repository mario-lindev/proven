import { NextResponse } from "next/server";
import { pollWatch } from "@/lib/search";
import { fail, fixture } from "@/lib/api";
import { isMock } from "@/lib/mock";
import { store } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (isMock()) return NextResponse.json(await fixture("watch"));
    const w = store.watches.get(id);
    if (!w) return fail(`watch ${id} not found`, 404);
    w.updates.push(...(await pollWatch(w.monitor_id)));
    return NextResponse.json(w);
  } catch (e) {
    return fail(e);
  }
}
