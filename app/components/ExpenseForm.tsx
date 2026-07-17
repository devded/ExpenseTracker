"use client";

import { useEffect, useState } from "react";
import type { Category, Expense } from "@/lib/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseForm({
  categories,
  symbol,
  initial,
  onSaved,
  onDeleted,
  onClose,
}: {
  categories: Category[];
  symbol: string;
  initial?: Expense | null; // present → edit mode
  onSaved: (expense: Expense) => void;
  onDeleted?: (id: string) => void;
  onClose?: () => void;
}) {
  const editing = !!initial?.id;

  const [name, setName] = useState(initial?.name || "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [category, setCategory] = useState(initial?.category || categories[0]?.name || "");
  const [date, setDate] = useState(initial?.date || todayISO());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the selected category valid as categories load / change (add mode only).
  useEffect(() => {
    if (!editing && categories.length && !categories.some((c) => c.name === category)) {
      setCategory(categories[0].name);
    }
  }, [categories, category, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        editing ? `/api/notion/expenses/${initial!.id}` : "/api/notion/expenses",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, amount: Number(amount), category, date }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      onSaved(data.expense);
      if (!editing) {
        setName("");
        setAmount("");
        setDate(todayISO());
      }
      onClose?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/notion/expenses/${initial!.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete.");
      }
      onDeleted?.(initial!.id);
      onClose?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
      setConfirmDel(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="desc">Description</label>
        <input
          id="desc"
          type="text"
          placeholder="e.g. Grocery run"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus={!!onClose && !editing}
        />
      </div>
      <div className="field">
        <label htmlFor="amount">Amount</label>
        <div className="amount-wrap">
          <span className="cur">{symbol}</span>
          <input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="category">Category</label>
        <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.length === 0 && <option value="">No categories</option>}
          {categories.map((c) => (
            <option key={c.id || c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="date">Date</label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      {error && <div className="notice error">{error}</div>}
      <button className="btn" type="submit" disabled={saving || deleting}>
        {saving ? "Saving…" : editing ? "Save changes" : "Add expense"}
      </button>
      {editing && onDeleted && (
        <button
          type="button"
          className={`btn ${confirmDel ? "danger" : "secondary"}`}
          style={{ marginTop: 10 }}
          onClick={remove}
          disabled={deleting || saving}
        >
          {deleting ? "Deleting…" : confirmDel ? "Tap again to confirm delete" : "Delete expense"}
        </button>
      )}
    </form>
  );
}
