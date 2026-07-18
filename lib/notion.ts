// Server-only Notion helpers. Every call here runs inside a Next.js route
// handler, so the integration token never reaches the browser and there is
// no CORS problem (the browser talks only to our own /api routes).

import type { Category, Expense, NewExpense } from "./types";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export const DB_NAME = "Notionance";

// Data-column property names. `ensureProperties` guarantees these exact names
// exist on the database, so reads and writes address them directly. Only the
// *title* column is resolved dynamically (a pre-existing database the user
// already had may name its title column anything), which is why the code looks
// asymmetric: dynamic title, fixed data columns. Centralizing the names here
// keeps that contract in one place.
const PROP = {
  amount: "Amount",
  category: "Category",
  date: "Date",
  notes: "Notes",
} as const;

export const CATEGORY_OPTIONS = [
  { name: "Food & Dining", color: "orange" },
  { name: "Transport", color: "blue" },
  { name: "Bills & Utilities", color: "red" },
  { name: "Leisure", color: "green" },
  { name: "Shopping", color: "purple" },
] as const;

// The property schema the Notionance database must have.
// `Name` is the title column; the rest are data columns.
export function expenseSchema(): Record<string, any> {
  return {
    Name: { title: {} },
    [PROP.amount]: { number: { format: "lira" } },
    [PROP.category]: { select: { options: CATEGORY_OPTIONS.map((c) => ({ ...c })) } },
    [PROP.date]: { date: {} },
    [PROP.notes]: { rich_text: {} },
  };
}

// Non-title properties we require to exist, keyed by name → expected type.
const REQUIRED_DATA_PROPS: Record<string, string> = {
  [PROP.amount]: "number",
  [PROP.category]: "select",
  [PROP.date]: "date",
  [PROP.notes]: "rich_text",
};

export class NotionError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "NotionError";
    this.status = status;
  }
}

async function notionFetch(token: string, path: string, options: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${NOTION_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new NotionError("Could not reach Notion. Check your network and try again.", 502);
  }

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.message ||
      (res.status === 401
        ? "Invalid Notion token."
        : `Notion API error (${res.status}).`);
    throw new NotionError(message, res.status);
  }
  return data;
}

// ---- Token & identity -----------------------------------------------------

export async function validateToken(token: string): Promise<{ name: string }> {
  const me = await notionFetch(token, "/users/me", { method: "GET" });
  return { name: me?.bot?.owner?.user?.name || me?.name || "Notion workspace" };
}

// ---- Database discovery / provisioning ------------------------------------

function titleText(obj: any): string {
  return (obj?.title || []).map((t: any) => t?.plain_text || "").join("").trim();
}

function findTitleKey(properties: Record<string, any>): string {
  for (const [key, value] of Object.entries(properties)) {
    if ((value as any)?.type === "title") return key;
  }
  return "Name";
}

// The property names a write needs to resolve (title + select) effectively
// never change for a given database, so cache them per database id. This keeps
// createExpense/updateExpense from re-fetching the whole schema on every write.
// A cold serverless instance simply repopulates the cache on first use.
type SchemaKeys = { titleKey: string; selectKey: string };
const schemaKeyCache = new Map<string, SchemaKeys>();

function cacheSchemaKeys(db: any): void {
  if (!db?.id || !db.properties) return;
  schemaKeyCache.set(db.id, {
    titleKey: findTitleKey(db.properties),
    selectKey: findSelectKey(db.properties),
  });
}

async function getSchemaKeys(token: string, databaseId: string): Promise<SchemaKeys> {
  const cached = schemaKeyCache.get(databaseId);
  if (cached) return cached;
  const db = await notionFetch(token, `/databases/${databaseId}`, { method: "GET" });
  const keys: SchemaKeys = {
    titleKey: findTitleKey(db.properties || {}),
    selectKey: findSelectKey(db.properties || {}),
  };
  schemaKeyCache.set(databaseId, keys);
  return keys;
}

async function findExpenseDatabase(token: string): Promise<any | null> {
  const result = await notionFetch(token, "/search", {
    method: "POST",
    body: JSON.stringify({
      query: DB_NAME,
      filter: { value: "database", property: "object" },
      page_size: 20,
    }),
  });
  const match = (result.results || []).find(
    (db: any) => titleText(db).toLowerCase() === DB_NAME.toLowerCase(),
  );
  return match || null;
}

// Add any required data properties that a pre-existing database is missing.
async function ensureProperties(token: string, db: any): Promise<string[]> {
  const props = db.properties || {};
  const toAdd: Record<string, any> = {};
  const schema = expenseSchema();

  for (const [name, type] of Object.entries(REQUIRED_DATA_PROPS)) {
    const existing = props[name];
    if (!existing || existing.type !== type) {
      toAdd[name] = schema[name];
    }
  }

  const added = Object.keys(toAdd);
  if (added.length > 0) {
    await notionFetch(token, `/databases/${db.id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: toAdd }),
    });
  }
  return added;
}

async function findParentPage(token: string): Promise<string | null> {
  const result = await notionFetch(token, "/search", {
    method: "POST",
    body: JSON.stringify({
      filter: { value: "page", property: "object" },
      page_size: 10,
    }),
  });
  const page = (result.results || []).find((p: any) => p.object === "page");
  return page?.id || null;
}

async function createExpenseDatabase(token: string, parentId: string): Promise<any> {
  return notionFetch(token, "/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentId },
      title: [{ type: "text", text: { content: DB_NAME } }],
      properties: expenseSchema(),
    }),
  });
}

export type EnsureResult = {
  databaseId: string;
  created: boolean;
  addedProperties: string[];
};

// Find the Notionance database (or create it) and make sure it has every
// property the app needs. This is the "check availability, otherwise create"
// step the app runs right after a user connects.
export async function ensureDatabase(token: string): Promise<EnsureResult> {
  const existing = await findExpenseDatabase(token);
  if (existing) {
    const added = await ensureProperties(token, existing);
    cacheSchemaKeys(existing);
    return { databaseId: existing.id, created: false, addedProperties: added };
  }

  const parentId = await findParentPage(token);
  if (!parentId) {
    throw new NotionError(
      "No page is shared with this integration yet. Open a Notion page, click " +
        "“···” → Connections → add your integration, then reconnect. The " +
        "Notionance database will be created inside that page.",
      400,
    );
  }

  const created = await createExpenseDatabase(token, parentId);
  cacheSchemaKeys(created);
  return {
    databaseId: created.id,
    created: true,
    addedProperties: Object.keys(REQUIRED_DATA_PROPS),
  };
}

// Update the Amount column's number format to match the chosen currency
// (cosmetic, Notion-side only). Best-effort — callers ignore failures.
export async function updateAmountFormat(
  token: string,
  databaseId: string,
  format: string,
): Promise<void> {
  await notionFetch(token, `/databases/${databaseId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { [PROP.amount]: { number: { format } } } }),
  });
}

// Is the stored database still reachable by this integration? Returns false
// if it was deleted, trashed, or unshared (Notion answers 404 in those cases).
export async function databaseAccessible(token: string, databaseId: string): Promise<boolean> {
  try {
    await notionFetch(token, `/databases/${databaseId}`, { method: "GET" });
    return true;
  } catch (err) {
    if (err instanceof NotionError && (err.status === 404 || err.status === 400)) return false;
    // Re-throw transient errors (network / auth) so callers don't re-provision by mistake.
    throw err;
  }
}

// ---- Expense rows ---------------------------------------------------------

function readExpense(page: any): Expense {
  const props = page.properties || {};
  let name = "";
  for (const value of Object.values<any>(props)) {
    if (value?.type === "title") {
      name = (value.title?.[0]?.plain_text || "").trim();
      break;
    }
  }
  return {
    id: page.id,
    name,
    amount: props[PROP.amount]?.number ?? 0,
    category: props[PROP.category]?.select?.name ?? null,
    date: props[PROP.date]?.date?.start ?? null,
    notes: props[PROP.notes]?.rich_text?.[0]?.plain_text ?? "",
  };
}

// Half-open date window [since, until) on the Date property. Both bounds are
// optional ISO dates (YYYY-MM-DD); omitting a bound leaves that side unbounded.
// Filtering server-side keeps us from pulling the entire history on every load.
export type DateRange = { since?: string; until?: string };

function dateFilter(range: DateRange): any | undefined {
  const clauses: any[] = [];
  if (range.since) clauses.push({ property: PROP.date, date: { on_or_after: range.since } });
  if (range.until) clauses.push({ property: PROP.date, date: { before: range.until } });
  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : { and: clauses };
}

export async function listExpenses(
  token: string,
  databaseId: string,
  range: DateRange = {},
): Promise<Expense[]> {
  const all: Expense[] = [];
  let cursor: string | undefined;
  const filter = dateFilter(range);
  // Page through every row in the requested window (older months load lazily).
  do {
    const body: any = {
      sorts: [{ property: PROP.date, direction: "descending" }],
      page_size: 100,
    };
    if (filter) body.filter = filter;
    if (cursor) body.start_cursor = cursor;
    const result = await notionFetch(token, `/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    all.push(...(result.results || []).map(readExpense));
    cursor = result.has_more ? result.next_cursor : undefined;
  } while (cursor);
  return all;
}

// ---- Category (select) options --------------------------------------------

const NOTION_COLORS = new Set([
  "default", "gray", "brown", "orange", "yellow",
  "green", "blue", "purple", "pink", "red",
]);

function findSelectKey(properties: Record<string, any>): string {
  if (properties?.[PROP.category]?.type === "select") return PROP.category;
  for (const [key, value] of Object.entries(properties || {})) {
    if ((value as any)?.type === "select") return key;
  }
  return PROP.category;
}

export async function getCategories(token: string, databaseId: string): Promise<Category[]> {
  const db = await notionFetch(token, `/databases/${databaseId}`, { method: "GET" });
  const key = findSelectKey(db.properties || {});
  const options = db.properties?.[key]?.select?.options || [];
  return options.map((o: any) => ({ id: o.id, name: o.name, color: o.color }));
}

// Replace the whole option set. Options carrying an `id` are kept/renamed;
// options without an `id` are created; omitted options are removed.
export async function setCategories(
  token: string,
  databaseId: string,
  options: Category[],
): Promise<Category[]> {
  const db = await notionFetch(token, `/databases/${databaseId}`, { method: "GET" });
  const key = findSelectKey(db.properties || {});

  const seen = new Set<string>();
  const clean = options
    .map((o) => ({
      ...(o.id ? { id: o.id } : {}),
      name: (o.name || "").trim(),
      color: NOTION_COLORS.has(o.color) ? o.color : "default",
    }))
    .filter((o) => {
      const lower = o.name.toLowerCase();
      if (!o.name || seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

  await notionFetch(token, `/databases/${databaseId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { [key]: { select: { options: clean } } } }),
  });
  return getCategories(token, databaseId);
}

// `titleKey` is passed in because the title column is the one property whose
// name we don't control; the rest address the fixed PROP names.
function buildExpenseProperties(input: NewExpense, titleKey: string): Record<string, any> {
  const properties: Record<string, any> = {
    [titleKey]: { title: [{ text: { content: input.name || "Untitled" } }] },
    [PROP.amount]: { number: Number.isFinite(input.amount) ? input.amount : 0 },
    [PROP.date]: { date: { start: input.date } },
    // Set (or clear) the category select.
    [PROP.category]: input.category ? { select: { name: input.category } } : { select: null },
  };
  // Only touch Notes when explicitly provided (preserves existing notes on edit).
  if (input.notes !== undefined) {
    properties[PROP.notes] = {
      rich_text: input.notes ? [{ text: { content: input.notes } }] : [],
    };
  }
  return properties;
}

export async function createExpense(
  token: string,
  databaseId: string,
  input: NewExpense,
): Promise<Expense> {
  // Look up the real title property name in case the database predates us.
  const { titleKey } = await getSchemaKeys(token, databaseId);

  const page = await notionFetch(token, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: buildExpenseProperties(input, titleKey),
    }),
  });
  return readExpense(page);
}

export async function updateExpense(
  token: string,
  databaseId: string,
  pageId: string,
  input: NewExpense,
): Promise<Expense> {
  const { titleKey } = await getSchemaKeys(token, databaseId);

  const page = await notionFetch(token, `/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: buildExpenseProperties(input, titleKey) }),
  });
  return readExpense(page);
}

// "Delete" = archive the page (removes it from the database).
export async function deleteExpense(token: string, pageId: string): Promise<void> {
  await notionFetch(token, `/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
  });
}
