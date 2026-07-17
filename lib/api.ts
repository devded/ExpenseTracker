// Shared helpers for the /api/notion route handlers: guard that a session
// exists, and turn a thrown error into a JSON response with the right status.
import { NextResponse } from "next/server";
import { NotionError } from "./notion";
import { getSession } from "./session";

// Ensure the request carries a connected session; throws a 401 NotionError
// (caught by `fail`) if not.
export function requireSession(): { token: string; databaseId: string } {
  const { token, databaseId } = getSession();
  if (!token || !databaseId) {
    throw new NotionError("Not connected to Notion.", 401);
  }
  return { token, databaseId };
}

// Map any error to a JSON error response, preserving NotionError status codes.
export function fail(err: unknown): NextResponse {
  const status = err instanceof NotionError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status });
}
