import { NextResponse } from "next/server";
import { ensureDatabase, validateToken } from "@/lib/notion";
import { assertSameOrigin, fail } from "@/lib/api";
import { writeSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/notion/connect  { token }
// Validates the integration token, ensures the Notionance database exists
// with the right schema, then stores the token in an httpOnly cookie.
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
  } catch (err) {
    return fail(err);
  }

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
    return fail(err);
  }
}
