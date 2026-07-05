import { NextResponse } from "next/server";
import { ensureDatabase, NotionError, validateToken } from "@/lib/notion";
import { writeSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/notion/connect  { token }
// Validates the integration token, ensures the ExpenseTracker database exists
// with the right schema, then stores the token in an httpOnly cookie.
export async function POST(req: Request) {
  let token: string;
  try {
    const body = await req.json();
    token = String(body?.token || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: "Please paste your Notion integration token." }, { status: 400 });
  }

  try {
    const identity = await validateToken(token);
    const ensured = await ensureDatabase(token);

    const res = NextResponse.json({
      connected: true,
      workspace: identity.name,
      databaseId: ensured.databaseId,
      created: ensured.created,
      addedProperties: ensured.addedProperties,
    });
    writeSession(res, token, ensured.databaseId);
    return res;
  } catch (err) {
    const status = err instanceof NotionError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status });
  }
}
