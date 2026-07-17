"use client";

import { useState } from "react";
import { CURRENCIES, symbolFor } from "@/lib/currencies";
import type { Prefs } from "@/lib/types";

export default function SettingsModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Prefs;
  onClose: () => void;
  onSaved: (prefs: Prefs) => void;
}) {
  const [currency, setCurrency] = useState(initial.currency);
  const [budget, setBudget] = useState(String(initial.budget));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/notion/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, budget: Number(budget) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save settings.");
      onSaved(data.prefs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="section-title">Settings</h2>
          <button className="icon-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="field">
          <label htmlFor="cur">Currency</label>
          <select id="cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol}  {c.label} ({c.code})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="budget">Monthly budget</label>
          <div className="amount-wrap">
            <span className="cur">{symbolFor(currency)}</span>
            <input
              id="budget"
              type="number"
              min="0"
              step="100"
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
        </div>

        <p className="muted">
          Currency changes how amounts display and updates your Notion Amount column format.
          Existing amounts are not converted.
        </p>

        {error && (
          <div className="notice error" style={{ marginTop: 14 }}>
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn narrow" onClick={save} disabled={busy} type="button">
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
