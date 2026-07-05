import { NextResponse } from "next/server";
import { databaseAccessible, ensureDatabase, validateToken } from "@/lib/notion";
import { clearSession, getSession, writeSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notion/status — is there a valid connection in the cookie?
// Also self-heals: if the token is valid but the stored database is gone
// (deleted / unshared), it re-finds or re-creates the database and refreshes
// the cookie, so the app never gets stuck pointing at a dead database id.
export async function GET() {
  const { token, databaseId } = getSession();
  if (!token) {
    return NextResponse.json({ connected: false });
  }

  try {
    const identity = await validateToken(token);

    // Happy path: stored database still exists and is reachable.
    if (databaseId && (await databaseAccessible(token, databaseId))) {
      return NextResponse.json({ connected: true, workspace: identity.name, databaseId });
    }

    // Database is missing/unshared — try to find or recreate it.
    try {
      const ensured = await ensureDatabase(token);
      const res = NextResponse.json({
        connected: true,
        workspace: identity.name,
        databaseId: ensured.databaseId,
        reprovisioned: true,
        created: ensured.created,
      });
      writeSession(res, token, ensured.databaseId);
      return res;
    } catch {
      // Token is fine but we couldn't reach or make a database (e.g. no page
      // shared with the integration). Send the user back to the setup screen.
      const res = NextResponse.json({ connected: false, needsSetup: true });
      clearSession(res);
      return res;
    }
  } catch {
    // Token was revoked or expired — drop the stale cookie.
    const res = NextResponse.json({ connected: false });
    clearSession(res);
    return res;
  }
}
