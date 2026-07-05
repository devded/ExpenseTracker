import { NextResponse } from "next/server";
import { getCategories, NotionError, setCategories, type CategoryOption } from "@/lib/notion";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireSession() {
  const { token, databaseId } = getSession();
  if (!token || !databaseId) throw new NotionError("Not connected to Notion.", 401);
  return { token, databaseId };
}

function fail(err: unknown) {
  const status = err instanceof NotionError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status });
}

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
    const { token, databaseId } = requireSession();
    const body = await req.json();
    const incoming: CategoryOption[] = Array.isArray(body?.categories) ? body.categories : [];
    if (incoming.length === 0) {
      return NextResponse.json({ error: "Keep at least one category." }, { status: 400 });
    }
    const categories = await setCategories(token, databaseId, incoming);
    return NextResponse.json({ categories });
  } catch (err) {
    return fail(err);
  }
}
