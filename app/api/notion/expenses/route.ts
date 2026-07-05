import { NextResponse } from "next/server";
import { createExpense, listExpenses, NotionError } from "@/lib/notion";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireSession() {
  const { token, databaseId } = getSession();
  if (!token || !databaseId) {
    throw new NotionError("Not connected to Notion.", 401);
  }
  return { token, databaseId };
}

function fail(err: unknown) {
  const status = err instanceof NotionError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status });
}

// GET /api/notion/expenses — list rows from the ExpenseTracker database.
export async function GET() {
  try {
    const { token, databaseId } = requireSession();
    const expenses = await listExpenses(token, databaseId);
    return NextResponse.json({ expenses });
  } catch (err) {
    return fail(err);
  }
}

// POST /api/notion/expenses — add a new expense row.
export async function POST(req: Request) {
  try {
    const { token, databaseId } = requireSession();
    const body = await req.json();

    const name = String(body?.name || "").trim();
    const amount = Number(body?.amount);
    const category = body?.category ? String(body.category) : null;
    const date = String(body?.date || "").trim();

    if (!name) return NextResponse.json({ error: "Description is required." }, { status: 400 });
    if (!Number.isFinite(amount) || amount < 0)
      return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
    if (!date) return NextResponse.json({ error: "Date is required." }, { status: 400 });

    const expense = await createExpense(token, databaseId, {
      name,
      amount,
      category,
      date,
      notes: body?.notes ? String(body.notes) : undefined,
    });
    return NextResponse.json({ expense });
  } catch (err) {
    return fail(err);
  }
}
