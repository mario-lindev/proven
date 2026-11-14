import { NextResponse } from "next/server";
import { pollWatch, runWatch, watchChanges } from "@/lib/search";
import { fail, fixture } from "@/lib/api";
import { isMock } from "@/lib/mock";
import { store } from "@/lib/store";
import type { Watch, WatchUpdate } from "@/lib/types";

function addUpdates(w: Watch, more: WatchUpdate[]) {
  const seen = new Set(w.updates.map((u) => `${u.url}|${u.title}`));
  for (const u of more) {
    const k = `${u.url}|${u.title}`;
    if (!seen.has(k)) {
      seen.add(k);
      w.updates.push(u);
    }
  }
}

async function mockWatch(id: string): Promise<Watch> {
  const w = store.watches.get(id);
  if (w) return w;
  const f = await fixture<Watch>("watch");
  f.updates = f.updates.map((u) => ({ ...u, title: u.title.replace(/Acme Robotics/g, "the company") }));
  const fresh = { ...f, id, updates: [...f.updates] };
  store.watches.set(id, fresh);
  return fresh;
}

// GET: what the Telem monitor agent found (changes since the last read), plus the legacy poll.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (isMock()) return NextResponse.json(await mockWatch(id));
    const w = store.watches.get(id);
    if (!w) return fail(`watch ${id} not found`, 404);
    const [changes, polled] = await Promise.allSettled([watchChanges(w.monitor_id, w.cursor), pollWatch(w.monitor_id)]);
    if (changes.status === "fulfilled") {
      addUpdates(w, changes.value.updates);
      w.cursor = changes.value.cursor;
    }
    if (polled.status === "fulfilled") addUpdates(w, polled.value);
    if (changes.status === "rejected" && polled.status === "rejected") throw changes.reason;
    return NextResponse.json(w);
  } catch (e) {
    return fail(e);
  }
}

// POST: "Check now". Runs the monitor's agent immediately instead of waiting for the hourly schedule.
// The agent works in the background; GET a few seconds later to read what it found.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (isMock()) {
      const w = await mockWatch(id);
      w.checked_at = new Date().toISOString();
      addUpdates(w, [
        {
          at: w.checked_at,
          title: `New: ${w.company} hiring for a VP of Sales`,
          url: "https://example.com/acme-vp-sales",
          summary: "Job post: VP of Sales, enterprise logistics accounts.",
        },
      ]);
      return NextResponse.json(w);
    }
    const w = store.watches.get(id);
    if (!w) return fail(`watch ${id} not found`, 404);
    await runWatch(w.monitor_id);
    w.checked_at = new Date().toISOString();
    return NextResponse.json(w);
  } catch (e) {
    return fail(e);
  }
}
