// Shared domain types — the single source of truth for shapes that cross the
// server/client boundary (lib/notion, the /api route handlers, and the React
// components). Keeping them here stops the same type from being redeclared in
// several files and quietly drifting apart.

// An expense row as the app reads it back from Notion.
export type Expense = {
  id: string;
  name: string;
  amount: number;
  category: string | null;
  date: string | null;
  notes: string;
};

// The fields accepted when creating or editing an expense. `notes` is optional
// so an edit can leave existing notes untouched by omitting it.
export type NewExpense = {
  name: string;
  amount: number;
  category: string | null;
  date: string;
  notes?: string;
};

// A category = one option of the Notion "Category" select column.
export type Category = { id?: string; name: string; color: string };

// Per-user preferences (stored in the `prefs` cookie).
export type Prefs = { currency: string; budget: number };
