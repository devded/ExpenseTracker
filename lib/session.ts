import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { Prefs } from "./types";

export const TOKEN_COOKIE = "notion_token";
export const DB_COOKIE = "notion_db";
export const PREFS_COOKIE = "prefs";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_YEAR = 60 * 60 * 24 * 365;

export const DEFAULT_PREFS: Prefs = { currency: "TRY", budget: 40000 };

export function getSession(): { token: string | null; databaseId: string | null } {
  const jar = cookies();
  return {
    token: jar.get(TOKEN_COOKIE)?.value || null,
    databaseId: jar.get(DB_COOKIE)?.value || null,
  };
}

export function writeSession(res: NextResponse, token: string, databaseId: string) {
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  };
  res.cookies.set(TOKEN_COOKIE, token, base);
  res.cookies.set(DB_COOKIE, databaseId, base);
}

export function clearSession(res: NextResponse) {
  res.cookies.set(TOKEN_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(DB_COOKIE, "", { path: "/", maxAge: 0 });
}

// Full logout: clear the auth session AND user preferences.
export function clearAll(res: NextResponse) {
  clearSession(res);
  res.cookies.set(PREFS_COOKIE, "", { path: "/", maxAge: 0 });
}

export function getPrefs(): Prefs {
  const raw = cookies().get(PREFS_COOKIE)?.value;
  if (!raw) return DEFAULT_PREFS;
  try {
    const p = JSON.parse(raw);
    return {
      currency: typeof p.currency === "string" ? p.currency : DEFAULT_PREFS.currency,
      budget: Number.isFinite(p.budget) ? p.budget : DEFAULT_PREFS.budget,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(res: NextResponse, prefs: Prefs) {
  res.cookies.set(PREFS_COOKIE, JSON.stringify(prefs), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}
