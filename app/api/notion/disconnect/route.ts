import { NextResponse } from "next/server";
import { clearAll } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/notion/disconnect — log out: clear the token, database, and prefs cookies.
export async function POST() {
  const res = NextResponse.json({ connected: false });
  clearAll(res);
  return res;
}
