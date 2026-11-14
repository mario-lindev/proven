import { NextResponse } from "next/server";
import { watch } from "@/lib/search";
import { fail, fixture } from "@/lib/api";
import { isMock } from "@/lib/mock";
import { newId, store } from "@/lib/store";
import type { Watch } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { company } = (await req.json()) as { company?: string };
    if (!company?.trim()) return fail("company is required", 400);
    if (isMock()) {
      const f = await fixture<Watch>("watch");
      const w: Watch = { ...f, id: newId("w"), company: company.trim(), updates: f.updates.map((u) => ({ ...u, title: u.title.replace(/Acme Robotics/g, company.trim()) })) };
      store.watches.set(w.id, w);
      return NextResponse.json(w);
    }
    const { monitor_id } = await watch(company.trim());
    const w: Watch = { id: newId("w"), company: company.trim(), monitor_id, updates: [] };
    store.watches.set(w.id, w);
    return NextResponse.json(w);
  } catch (e) {
    return fail(e);
  }
}
