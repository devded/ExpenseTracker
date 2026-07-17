import { NextResponse } from "next/server";
import { updateAmountFormat } from "@/lib/notion";
import { assertSameOrigin, fail } from "@/lib/api";
import { DEFAULT_PREFS, getPrefs, getSession, writePrefs } from "@/lib/session";
import { currencyByCode } from "@/lib/currencies";
import type { Prefs } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notion/settings — current currency + budget preferences.
export async function GET() {
  return NextResponse.json({ prefs: getPrefs() });
}

// PUT /api/notion/settings  { currency, budget }
export async function PUT(req: Request) {
  try {
    assertSameOrigin(req);
  } catch (err) {
    return fail(err);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const currency = currencyByCode(String(body?.currency || DEFAULT_PREFS.currency)).code;
  const budgetNum = Number(body?.budget);
  const budget =
    Number.isFinite(budgetNum) && budgetNum >= 0 ? Math.round(budgetNum) : DEFAULT_PREFS.budget;
  const prefs: Prefs = { currency, budget };

  const res = NextResponse.json({ prefs });
  writePrefs(res, prefs);

  // Best-effort: match the Notion Amount column format to the chosen currency.
  const { token, databaseId } = getSession();
  if (token && databaseId) {
    try {
      await updateAmountFormat(token, databaseId, currencyByCode(currency).notion);
    } catch {
      /* cosmetic only — ignore */
    }
  }
  return res;
}
