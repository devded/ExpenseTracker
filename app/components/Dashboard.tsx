"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pillStyle } from "@/lib/colors";
import { symbolFor } from "@/lib/currencies";
import CategoriesModal, { type Cat } from "./CategoriesModal";
import SettingsModal, { type Prefs } from "./SettingsModal";
import ExpenseForm from "./ExpenseForm";
import Stats from "./Stats";

type Expense = {
  id: string;
  name: string;
  amount: number;
  category: string | null;
  date: string | null;
  notes: string;
};

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}
function daysInMonth(year: number, month1: number) {
  return new Date(year, month1, 0).getDate();
}

export default function Dashboard({
  workspace,
  onDisconnect,
}: {
  workspace: string;
  onDisconnect: () => void;
}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [prefs, setPrefs] = useState<Prefs>({ currency: "TRY", budget: 40000 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCats, setShowCats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // selected month (defaults to the current month)
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based

  const [showAdd, setShowAdd] = useState(false); // mobile add-expense sheet

  const symbol = symbolFor(prefs.currency);
  const money = (n: number) =>
    symbol + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const whole = (n: number) => symbol + Math.round(n).toLocaleString();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [exRes, catRes, setRes] = await Promise.all([
        fetch("/api/notion/expenses"),
        fetch("/api/notion/categories"),
        fetch("/api/notion/settings"),
      ]);
      const exData = await exRes.json();
      if (!exRes.ok) throw new Error(exData.error || "Failed to load expenses.");
      setExpenses(exData.expenses);

      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories);
      }
      if (setRes.ok) {
        const setData = await setRes.json();
        setPrefs(setData.prefs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the account menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // category name → color, for tag rendering
  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.name, c.color);
    return (n: string | null) => (n ? map.get(n) || "default" : "gray");
  }, [categories]);

  function handleCreated(expense: Expense) {
    setExpenses((prev) => [expense, ...prev]);
    // jump the view to the month we just added into
    if (expense.date) {
      const [y, m] = expense.date.split("-").map(Number);
      setYear(y);
      setMonth(m);
    }
  }

  function stepMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  // ---- rows + metrics for the selected month ----
  const { monthRows, metrics } = useMemo(() => {
    const rows = expenses
      .filter((x) => {
        if (!x.date) return false;
        const [y, m] = x.date.split("-").map(Number);
        return y === year && m === month;
      })
      .sort((a, b) => (a.date! < b.date! ? 1 : -1));

    const spent = rows.reduce((s, x) => s + (x.amount || 0), 0);
    const cats = new Set(rows.map((x) => x.category).filter(Boolean));
    const denom = isCurrentMonth ? now.getDate() : daysInMonth(year, month);
    const dailyAvg = rows.length ? spent / denom : 0;

    const byCat = new Map<string, number>();
    for (const x of rows) {
      const key = x.category || "Uncategorized";
      byCat.set(key, (byCat.get(key) || 0) + (x.amount || 0));
    }
    const breakdown = [...byCat.entries()]
      .map(([cat, total]) => ({ cat, total }))
      .sort((a, b) => b.total - a.total);
    const maxCat = breakdown[0]?.total || 1;

    return {
      monthRows: rows,
      metrics: {
        spent,
        count: rows.length,
        catCount: cats.size,
        dailyAvg,
        remaining: prefs.budget - spent,
        breakdown,
        maxCat,
      },
    };
  }, [expenses, year, month, isCurrentMonth, now, prefs.budget]);

  const monthLabel = `${MONTHS_LONG[month - 1]} ${year}`;
  const initials = workspace.slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      {/* Header */}
      <header className="topbar">
        <div className="brand-mark">
          <div className="glyph">₤</div>
          <div>
            <div className="name">Ledger</div>
            <div className="sub">Expense Tracker</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="month-stepper">
            <button className="step" onClick={() => stepMonth(-1)} aria-label="Previous month">
              ‹
            </button>
            <span className="month-label">{monthLabel}</span>
            <button
              className="step"
              onClick={() => stepMonth(1)}
              aria-label="Next month"
              disabled={isCurrentMonth}
            >
              ›
            </button>
          </div>
          <div className="account" ref={menuRef}>
            <button
              className="avatar"
              onClick={() => setMenuOpen((o) => !o)}
              title={workspace}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {initials}
            </button>
            {menuOpen && (
              <div className="account-menu" role="menu">
                <div className="am-head">
                  <div className="am-name">{workspace}</div>
                  <div className="am-sub">Connected to Notion</div>
                </div>
                <button
                  className="am-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowSettings(true);
                  }}
                >
                  Settings
                </button>
                <button
                  className="am-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowCats(true);
                  }}
                >
                  Categories
                </button>
                <div className="am-divider" />
                <button
                  className="am-item danger"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowLogout(true);
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Summary metrics */}
      <section className="metrics">
        <div className="metric-card accent">
          <div className="label">Spent in {MONTHS_LONG[month - 1]}</div>
          <div className="value">{whole(metrics.spent)}</div>
          <div className="delta">{metrics.count} transactions</div>
        </div>
        <div className="metric-card">
          <div className="label">Monthly budget</div>
          <div className="value">{whole(prefs.budget)}</div>
          <div className={`delta ${metrics.remaining < 0 ? "up" : "down"}`}>
            {metrics.remaining < 0
              ? `${whole(-metrics.remaining)} over`
              : `${whole(metrics.remaining)} remaining`}
          </div>
        </div>
        <div className="metric-card">
          <div className="label">Daily average</div>
          <div className="value">{whole(metrics.dailyAvg)}</div>
          <div className="delta">
            over {isCurrentMonth ? now.getDate() : daysInMonth(year, month)} days
          </div>
        </div>
        <div className="metric-card">
          <div className="label">Categories</div>
          <div className="value">{metrics.catCount}</div>
          <div className="delta">active this month</div>
        </div>
      </section>

      {/* Insights */}
      {!loading && !error && (
        <Stats expenses={expenses} symbol={symbol} year={year} month={month} />
      )}

      {/* Body */}
      <div className="grid">
        {/* Add expense — inline on desktop, hidden on mobile (use the + button) */}
        <section className="panel add-panel">
          <h2 className="section-title">Add an expense</h2>
          <ExpenseForm categories={categories} symbol={symbol} onCreated={handleCreated} />
        </section>

        {/* Transactions for the selected month */}
        <section className="panel">
          <div className="panel-head">
            <h2 className="section-title">{monthLabel}</h2>
            <span className="muted">
              {loading ? "…" : `${monthRows.length} in month · ${expenses.length} all time`}
            </span>
          </div>

          {error ? (
            <div className="notice error" style={{ marginTop: 16 }}>
              {error}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="empty-row">
                    <td colSpan={3}>
                      <span className="spinner" />
                      Loading from Notion…
                    </td>
                  </tr>
                ) : monthRows.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={3}>No expenses in {monthLabel}.</td>
                  </tr>
                ) : (
                  monthRows.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <div className="tx-name">{x.name || "Untitled"}</div>
                        <div className="tx-date">{formatDate(x.date)}</div>
                      </td>
                      <td>
                        <span className="tag" style={pillStyle(colorOf(x.category))}>
                          {x.category || "Uncategorized"}
                        </span>
                      </td>
                      <td className="num">{money(x.amount || 0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* Category breakdown for the month */}
          {!loading && !error && metrics.breakdown.length > 0 && (
            <div className="breakdown">
              <h2 className="section-title">Spend by category</h2>
              {metrics.breakdown.map(({ cat, total }) => (
                <div className="bar-row" key={cat}>
                  <span className="cat">{cat}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${Math.max(4, (total / metrics.maxCat) * 100)}%` }}
                    />
                  </div>
                  <span className="amt">{whole(total)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer>Ledger · backed by your Notion workspace</footer>

      {/* Floating add button (mobile) + bottom sheet */}
      <button className="fab" onClick={() => setShowAdd(true)} aria-label="Add expense">
        +
      </button>
      {showAdd && (
        <div className="sheet-overlay" onClick={() => setShowAdd(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-head">
              <h2 className="section-title">Add an expense</h2>
              <button className="icon-x" onClick={() => setShowAdd(false)} aria-label="Close">
                ×
              </button>
            </div>
            <ExpenseForm
              categories={categories}
              symbol={symbol}
              onCreated={handleCreated}
              onClose={() => setShowAdd(false)}
            />
          </div>
        </div>
      )}

      {showCats && (
        <CategoriesModal
          initial={categories}
          onClose={() => setShowCats(false)}
          onSaved={(cats) => {
            setCategories(cats);
            setShowCats(false);
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          initial={prefs}
          onClose={() => setShowSettings(false)}
          onSaved={(p) => {
            setPrefs(p);
            setShowSettings(false);
          }}
        />
      )}

      {showLogout && (
        <div className="modal-overlay" onClick={() => !loggingOut && setShowLogout(false)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="section-title">Log out</h2>
              <button
                className="icon-x"
                onClick={() => setShowLogout(false)}
                aria-label="Close"
                disabled={loggingOut}
              >
                ×
              </button>
            </div>
            <p className="muted">
              This clears your Notion token, database link, and settings from this browser. Your
              Notion data is untouched — you&apos;ll just paste your token again to reconnect.
            </p>
            <div className="modal-actions">
              <button
                className="ghost-btn"
                onClick={() => setShowLogout(false)}
                type="button"
                disabled={loggingOut}
              >
                Cancel
              </button>
              <button
                className="btn narrow danger"
                onClick={async () => {
                  setLoggingOut(true);
                  await onDisconnect();
                }}
                disabled={loggingOut}
                type="button"
              >
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
