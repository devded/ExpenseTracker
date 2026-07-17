import { NextResponse } from "next/server";
import { getCategories, setCategories } from "@/lib/notion";
import { assertSameOrigin, fail, requireSession } from "@/lib/api";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notion/categories — current Category select options.
export async function GET() {
  try {
    const { token, databaseId } = requireSession();
    const categories = await getCategories(token, databaseId);
    return NextResponse.json({ categories });
  } catch (err) {
    return fail(err);
  }
}

// PUT /api/notion/categories  { categories: [{ id?, name, color }] }
export async function PUT(req: Request) {
  try {
    assertSameOrigin(req);
    const { token, databaseId } = requireSession();
    const body = await req.json();
    const incoming: Category[] = Array.isArray(body?.categories) ? body.categories : [];
    if (incoming.length === 0) {
      return NextResponse.json({ error: "Keep at least one category." }, { status: 400 });
    }
    const categories = await setCategories(token, databaseId, incoming);
    return NextResponse.json({ categories });
  } catch (err) {
    return fail(err);
  }
}
