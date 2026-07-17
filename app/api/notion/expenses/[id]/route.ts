import { NextResponse } from "next/server";
import { deleteExpense, updateExpense } from "@/lib/notion";
import { fail, requireSession } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/notion/expenses/:id — update an expense.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

    const expense = await updateExpense(token, databaseId, params.id, {
      name,
      amount,
      category,
      date,
    });
    return NextResponse.json({ expense });
  } catch (err) {
    return fail(err);
  }
}

// DELETE /api/notion/expenses/:id — archive an expense.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { token } = requireSession();
    await deleteExpense(token, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
