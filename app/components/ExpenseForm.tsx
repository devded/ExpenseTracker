"use client";

import { useEffect, useState } from "react";
import type { Cat } from "./CategoriesModal";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseForm({
  categories,
  symbol,
  onCreated,
  onClose,
}: {
  categories: Cat[];
  symbol: string;
  onCreated: (expense: any) => void;
  onClose?: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(categories[0]?.name || "");
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the selected category valid as categories load / change.
  useEffect(() => {
    if (categories.length && !categories.some((c) => c.name === category)) {
      setCategory(categories[0].name);
    }
  }, [categories, category]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notion/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount: Number(amount), category, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      onCreated(data.expense);
      setName("");
      setAmount("");
      setDate(todayISO());
      onClose?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
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
          autoFocus={!!onClose}
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
      <button className="btn" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Add expense"}
      </button>
    </form>
  );
}
