import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { getMemo } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memo = getMemo(id);
  return memo ? NextResponse.json(memo) : fail(`memo ${id} not found`, 404);
}
