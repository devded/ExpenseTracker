"use client";

import { useState } from "react";
import { NOTION_COLORS, swatchColor } from "@/lib/colors";

export type Cat = { id?: string; name: string; color: string };

export default function CategoriesModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Cat[];
  onClose: () => void;
  onSaved: (cats: Cat[]) => void;
}) {
  const [rows, setRows] = useState<Cat[]>(
    initial.length ? initial.map((c) => ({ ...c })) : [{ name: "", color: "blue" }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<Cat>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function add() {
    setRows((prev) => [...prev, { name: "", color: "gray" }]);
  }

  async function save() {
    const cleaned = rows.filter((r) => r.name.trim());
    if (cleaned.length === 0) {
      setError("Keep at least one category.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/notion/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save categories.");
      onSaved(data.categories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save categories.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="section-title">Edit categories</h2>
          <button className="icon-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="muted" style={{ marginBottom: 16 }}>
          These are the options for the <strong>Category</strong> column in your Notion database.
          Renaming updates existing expenses; removing a category clears it from them.
        </p>

        <div className="cat-list">
          {rows.map((row, i) => (
            <div className="cat-row" key={row.id || `new-${i}`}>
              <span className="cat-dot" style={{ background: swatchColor(row.color) }} />
              <input
                className="cat-name"
                type="text"
                placeholder="Category name"
                value={row.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <select
                className="cat-color"
                value={row.color}
                onChange={(e) => update(i, { color: e.target.value })}
              >
                {NOTION_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                className="icon-x small"
                onClick={() => remove(i)}
                aria-label="Remove"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button className="btn secondary" style={{ marginTop: 4 }} onClick={add} type="button">
          + Add category
        </button>

        {error && (
          <div className="notice error" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn narrow" onClick={save} disabled={busy} type="button">
            {busy ? "Saving…" : "Save categories"}
          </button>
        </div>
      </div>
    </div>
  );
}
