import { NextResponse } from "next/server";
import { assertSameOrigin, fail } from "@/lib/api";
import { clearAll } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/notion/disconnect — log out: clear the token, database, and prefs cookies.
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
  } catch (err) {
    return fail(err);
  }
  const res = NextResponse.json({ connected: false });
  clearAll(res);
  return res;
}
