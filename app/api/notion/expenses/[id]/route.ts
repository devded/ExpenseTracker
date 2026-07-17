import { NextResponse } from "next/server";
import { deleteExpense, updateExpense } from "@/lib/notion";
import { assertSameOrigin, fail, parseExpenseInput, requireSession } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/notion/expenses/:id — update an expense.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(req);
    const { token, databaseId } = requireSession();
    const input = parseExpenseInput(await req.json());
    const expense = await updateExpense(token, databaseId, params.id, input);
    return NextResponse.json({ expense });
  } catch (err) {
    return fail(err);
  }
}

// DELETE /api/notion/expenses/:id — archive an expense.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(req);
    const { token } = requireSession();
    await deleteExpense(token, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
