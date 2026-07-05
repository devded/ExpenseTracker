// Server-only Notion helpers. Every call here runs inside a Next.js route
// handler, so the integration token never reaches the browser and there is
// no CORS problem (the browser talks only to our own /api routes).

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export const DB_NAME = "ExpenseTracker";

export const CATEGORY_OPTIONS = [
  { name: "Food & Dining", color: "orange" },
  { name: "Transport", color: "blue" },
  { name: "Bills & Utilities", color: "red" },
  { name: "Leisure", color: "green" },
  { name: "Shopping", color: "purple" },
] as const;

// The property schema the ExpenseTracker database must have.
// `Name` is the title column; the rest are data columns.
export function expenseSchema(): Record<string, any> {
  return {
    Name: { title: {} },
    Amount: { number: { format: "lira" } },
    Category: { select: { options: CATEGORY_OPTIONS.map((c) => ({ ...c })) } },
    Date: { date: {} },
    Notes: { rich_text: {} },
  };
}

// Non-title properties we require to exist, keyed by name → expected type.
const REQUIRED_DATA_PROPS: Record<string, string> = {
  Amount: "number",
  Category: "select",
  Date: "date",
  Notes: "rich_text",
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

export type Expense = {
  id: string;
  name: string;
  amount: number;
  category: string | null;
  date: string | null;
  notes: string;
};

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

// Find the ExpenseTracker database (or create it) and make sure it has every
// property the app needs. This is the "check availability, otherwise create"
// step the app runs right after a user connects.
export async function ensureDatabase(token: string): Promise<EnsureResult> {
  const existing = await findExpenseDatabase(token);
  if (existing) {
    const added = await ensureProperties(token, existing);
    return { databaseId: existing.id, created: false, addedProperties: added };
  }

  const parentId = await findParentPage(token);
  if (!parentId) {
    throw new NotionError(
      "No page is shared with this integration yet. Open a Notion page, click " +
        "“···” → Connections → add your integration, then reconnect. The " +
        "ExpenseTracker database will be created inside that page.",
      400,
    );
  }

  const created = await createExpenseDatabase(token, parentId);
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
    body: JSON.stringify({ properties: { Amount: { number: { format } } } }),
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
    amount: props.Amount?.number ?? 0,
    category: props.Category?.select?.name ?? null,
    date: props.Date?.date?.start ?? null,
    notes: props.Notes?.rich_text?.[0]?.plain_text ?? "",
  };
}

export async function listExpenses(token: string, databaseId: string): Promise<Expense[]> {
  const all: Expense[] = [];
  let cursor: string | undefined;
  // Page through every row so the month-by-month view can reach older months.
  do {
    const body: any = {
      sorts: [{ property: "Date", direction: "descending" }],
      page_size: 100,
    };
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

export type CategoryOption = { id?: string; name: string; color: string };

const NOTION_COLORS = new Set([
  "default", "gray", "brown", "orange", "yellow",
  "green", "blue", "purple", "pink", "red",
]);

function findSelectKey(properties: Record<string, any>): string {
  if (properties?.Category?.type === "select") return "Category";
  for (const [key, value] of Object.entries(properties || {})) {
    if ((value as any)?.type === "select") return key;
  }
  return "Category";
}

export async function getCategories(token: string, databaseId: string): Promise<CategoryOption[]> {
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
  options: CategoryOption[],
): Promise<CategoryOption[]> {
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

export type NewExpense = {
  name: string;
  amount: number;
  category: string | null;
  date: string;
  notes?: string;
};

export async function createExpense(
  token: string,
  databaseId: string,
  input: NewExpense,
): Promise<Expense> {
  // Look up the real title property name in case the database predates us.
  const db = await notionFetch(token, `/databases/${databaseId}`, { method: "GET" });
  const titleKey = findTitleKey(db.properties || {});

  const properties: Record<string, any> = {
    [titleKey]: { title: [{ text: { content: input.name || "Untitled" } }] },
    Amount: { number: Number.isFinite(input.amount) ? input.amount : 0 },
    Date: { date: { start: input.date } },
  };
  if (input.category) properties.Category = { select: { name: input.category } };
  if (input.notes) properties.Notes = { rich_text: [{ text: { content: input.notes } }] };

  const page = await notionFetch(token, "/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
  });
  return readExpense(page);
}
