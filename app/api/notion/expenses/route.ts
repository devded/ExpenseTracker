import { NextResponse } from "next/server";
import { createExpense, listExpenses } from "@/lib/notion";
import { assertSameOrigin, fail, parseExpenseInput, requireSession } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accept only well-formed ISO dates (YYYY-MM-DD) as filter bounds; ignore junk
// so a malformed query param can never be forwarded into the Notion filter.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isoParam(value: string | null): string | undefined {
  return value && ISO_DATE.test(value) ? value : undefined;
}

// GET /api/notion/expenses[?since=YYYY-MM-DD&until=YYYY-MM-DD]
// Lists rows from the Notionance database, optionally within a date window.
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
    assertSameOrigin(req);
    const { token, databaseId } = requireSession();
    const input = parseExpenseInput(await req.json());
    const expense = await createExpense(token, databaseId, input);
    return NextResponse.json({ expense });
  } catch (err) {
    return fail(err);
  }
}
