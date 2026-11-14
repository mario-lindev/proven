import { NextResponse } from "next/server";
import { buildMemo } from "@/lib/brain/memo";
import { fail, fixture } from "@/lib/api";
import { isMock } from "@/lib/mock";
import { newId, newTrail, saveMemo, store } from "@/lib/store";
import type { Memo, MemoEvent, Trail } from "@/lib/types";

export const maxDuration = 300;

type Body = { company?: string; context?: string; depth?: "quick" | "deep"; stream?: boolean };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("body must be JSON", 400);
  }
  const company = body.company?.trim();
  if (!company) return fail("company is required", 400);
  const depth = body.depth === "quick" ? "quick" : "deep";

  if (!body.stream) {
    try {
      if (isMock()) return NextResponse.json(await mockMemo(company));
      return NextResponse.json(await buildMemo(company, body.context, depth));
    } catch (e) {
      return fail(e);
    }
  }

  // Streaming: NDJSON, one MemoEvent per line (lib/types.ts).
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (ev: MemoEvent) => {
        if (open) controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      };
      try {
        if (isMock()) {
          const t = JSON.parse(JSON.stringify(await fixture<Trail>("trail")).replace(/Acme Robotics|Acme/g, safeName(company))) as Trail;
          const trail = newTrail();
          send({ type: "start", trail_id: trail.id, company, depth });
          for (const s of t.steps) {
            await new Promise((r) => setTimeout(r, Math.min(900, 250 + s.ms / 8)));
            const step = { ...s, at: new Date().toISOString() };
            store.trails.get(trail.id)?.steps.push(step);
            send({ type: "step", step });
          }
          const memo = { ...(await mockMemo(company)), trail_id: trail.id };
          saveMemo(memo);
          send({ type: "memo", memo });
        } else {
          const trail = newTrail((step) => send({ type: "step", step }));
          send({ type: "start", trail_id: trail.id, company, depth });
          send({ type: "memo", memo: await buildMemo(company, body.context, depth, trail) });
        }
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        open = false;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

async function mockMemo(company: string): Promise<Memo> {
  // Fixture text says "Acme Robotics"; swap in the typed name so mock demos read naturally.
  const raw = JSON.stringify(await fixture<Memo>("memo")).replace(/Acme Robotics|Acme/g, safeName(company));
  const m = JSON.parse(raw) as Memo;
  return { ...m, id: newId("memo"), company, created_at: new Date().toISOString() };
}

const safeName = (company: string) => company.replace(/["\\]/g, "");
