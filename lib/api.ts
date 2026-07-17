// Shared helpers for the /api/notion route handlers: guard that a session
// exists, and turn a thrown error into a JSON response with the right status.
import { NextResponse } from "next/server";
import { NotionError } from "./notion";
import { getSession } from "./session";
import { MAX_AMOUNT, MAX_TEXT_LEN, type NewExpense } from "./types";

// Defense-in-depth against CSRF on state-changing requests. The httpOnly cookie
// is already `sameSite: "lax"`, which stops cross-site POSTs from carrying it,
// but we also reject any request whose Origin doesn't match our own host. A
// forged cross-site request always carries the attacker's Origin, so this
// catches it; same-origin requests match. Requests with no Origin header at all
// (e.g. some GET navigations — never the mutations we call this on) are left
// alone, since there's nothing to compare.
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new NotionError("Invalid request origin.", 403);
  }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host || originHost !== host) {
    throw new NotionError("Cross-origin request blocked.", 403);
  }
}

// Parse + validate an expense payload (shared by create and update). Throws a
// 400 NotionError on bad input. `notes` is only included when the caller sent
// it, so an edit that omits it leaves existing notes untouched.
export function parseExpenseInput(body: any): NewExpense {
  const name = String(body?.name || "").trim();
  const amount = Number(body?.amount);
  const category = body?.category ? String(body.category) : null;
  const date = String(body?.date || "").trim();

  if (!name) throw new NotionError("Description is required.", 400);
  if (name.length > MAX_TEXT_LEN) throw new NotionError("Description is too long.", 400);
  if (!Number.isFinite(amount) || amount < 0) throw new NotionError("Enter a valid amount.", 400);
  if (amount > MAX_AMOUNT) throw new NotionError("Amount is too large.", 400);
  if (!date) throw new NotionError("Date is required.", 400);

  const input: NewExpense = { name, amount, category, date };
  if (body?.notes !== undefined) {
    const notes = String(body.notes);
    if (notes.length > MAX_TEXT_LEN) throw new NotionError("Notes are too long.", 400);
    input.notes = notes;
  }
  return input;
}

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
