// CORS for /api/* so the Chrome extension (and a deployed site) can call the API.
import { NextResponse, type NextRequest } from "next/server";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/setup") return NextResponse.next();
  if (req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers });
  const res = NextResponse.next();
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export const config = { matcher: "/api/:path*" };
