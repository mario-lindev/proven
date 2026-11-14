import { NextResponse } from "next/server";

export const fail = (e: unknown, status = 500) =>
  NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });

export async function fixture<T>(name: string): Promise<T> {
  return (await import(`../fixtures/${name}.json`)).default as T;
}
