import { NextResponse } from "next/server";
import { createExpense, listExpenses } from "@/lib/notion";
import { fail, requireSession } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accept only well-formed ISO dates (YYYY-MM-DD) as filter bounds; ignore junk
// so a malformed query param can never be forwarded into the Notion filter.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isoParam(value: string | null): string | undefined {
  return value && ISO_DATE.test(value) ? value : undefined;
}

// GET /api/notion/expenses[?since=YYYY-MM-DD&until=YYYY-MM-DD]
// Lists rows from the ExpenseTracker database, optionally within a date window.
export async function GET(req: Request) {
  try {
    const { token, databaseId } = requireSession();
    const { searchParams } = new URL(req.url);
    const range = {
      since: isoParam(searchParams.get("since")),
      until: isoParam(searchParams.get("until")),
    };
    const expenses = await listExpenses(token, databaseId, range);
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
