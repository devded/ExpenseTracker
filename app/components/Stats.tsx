"use client";

import { useMemo } from "react";

type Expense = { id: string; amount: number; date: string | null };

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const HEAT_COLORS = ["#edece4", "#d6dfea", "#a9bdd6", "#5f7fa6", "#1b365d"];
const HEAT_WEEKS = 53;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function atMidnight(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// Monday-based start of week
function startOfWeek(d: Date) {
  const x = atMidnight(d);
  const day = (x.getDay() + 6) % 7;
  return addDays(x, -day);
}
function daysInMonth(year: number, month1: number) {
  return new Date(year, month1, 0).getDate();
}
function shortDate(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}
function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
// Scale to a robust cap so rare outliers don't flatten normal days; days above
// the cap clip to 100% (and get an "over" marker). Floor keeps small days visible.
function barPct(total: number, scaleMax: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(6, (total / scaleMax) * 100));
}

export default function Stats({
  expenses,
  symbol,
  year,
  month,
}: {
  expenses: Expense[];
  symbol: string;
  year: number;
  month: number; // 1-based, drives the daily chart
}) {
  const whole = (n: number) => symbol + Math.round(n).toLocaleString();

  const totalsByIso = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses) {
      if (!e.date) continue;
      const iso = e.date.split("T")[0];
      m.set(iso, (m.get(iso) || 0) + (e.amount || 0));
    }
    return m;
  }, [expenses]);

  // ---- This week vs last week (rolling, Monday-based, based on today) ----
  const week = useMemo(() => {
    const today = atMidnight(new Date());
    const thisStart = startOfWeek(today);
    const lastStart = addDays(thisStart, -7);
    let thisWeek = 0;
    let lastWeek = 0;
    for (const e of expenses) {
      if (!e.date) continue;
      const d = atMidnight(new Date(e.date.split("T")[0] + "T00:00:00"));
      if (d >= thisStart && d <= today) thisWeek += e.amount || 0;
      else if (d >= lastStart && d < thisStart) lastWeek += e.amount || 0;
    }
    const delta = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : thisWeek > 0 ? 100 : 0;
    const max = Math.max(1, thisWeek, lastWeek);
    return { thisWeek, lastWeek, delta, max };
  }, [expenses]);

  // ---- Daily spend for the selected month ----
  const daily = useMemo(() => {
    const dim = daysInMonth(year, month);
    const rows = Array.from({ length: dim }, (_, i) => {
      const day = i + 1;
      const iso = `${year}-${pad(month)}-${pad(day)}`;
      return { day, total: totalsByIso.get(iso) || 0 };
    });
    const nz = rows
      .map((r) => r.total)
      .filter((t) => t > 0)
      .sort((a, b) => a - b);
    // Scale to the 90th percentile so a rare big day doesn't flatten the rest.
    const scaleMax = Math.max(1, quantile(nz, 0.9));
    return { rows, scaleMax };
  }, [totalsByIso, year, month]);

  // ---- Calendar heatmap (last ~12 months) ----
  const heat = useMemo(() => {
    const today = atMidnight(new Date());
    const start = startOfWeek(addDays(today, -(HEAT_WEEKS - 1) * 7));
    const cols: { iso: string; total: number | null; date: Date }[][] = [];
    for (let w = 0; w < HEAT_WEEKS; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, w * 7 + d);
        const future = date > today;
        col.push({ iso: toIso(date), date, total: future ? null : totalsByIso.get(toIso(date)) || 0 });
      }
      cols.push(col);
    }
    const vals = cols
      .flat()
      .filter((c) => c.total != null && c.total > 0)
      .map((c) => c.total as number)
      .sort((a, b) => a - b);
    const q = (p: number) => (vals.length ? vals[Math.floor((vals.length - 1) * p)] : 0);
    const t1 = q(0.25);
    const t2 = q(0.5);
    const t3 = q(0.75);
    const level = (total: number | null) => {
      if (total == null) return -1;
      if (total <= 0) return 0;
      if (total <= t1) return 1;
      if (total <= t2) return 2;
      if (total <= t3) return 3;
      return 4;
    };
    // Month labels above columns. Keep them ≥3 columns apart so they never
    // overlap; drop the tiny leading partial month in favor of the next one.
    const MIN_GAP = 3;
    const starts: { w: number; m: number }[] = [];
    let prevMonth = -1;
    cols.forEach((col, w) => {
      const m = col[0].date.getMonth();
      if (m !== prevMonth) {
        starts.push({ w, m });
        prevMonth = m;
      }
    });
    const labels: { w: number; text: string }[] = [];
    for (const s of starts) {
      const last = labels[labels.length - 1];
      if (last && s.w - last.w < MIN_GAP) {
        // Too close: if it's the cramped leading label, replace it; else skip.
        if (labels.length === 1 && last.w < MIN_GAP) {
          labels[0] = { w: s.w, text: MONTHS_SHORT[s.m] };
        }
        continue;
      }
      labels.push({ w: s.w, text: MONTHS_SHORT[s.m] });
    }

    // Summary stats for the side panel.
    const flat = cols
      .flat()
      .filter((c) => c.total != null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    let daysTracked = 0;
    let sum = 0;
    let busiest = { iso: "", total: 0 };
    let cur = 0;
    let longest = 0;
    for (const c of flat) {
      const t = c.total || 0;
      if (t > 0) {
        daysTracked++;
        sum += t;
        if (t > busiest.total) busiest = { iso: c.iso, total: t };
        cur++;
        if (cur > longest) longest = cur;
      } else {
        cur = 0;
      }
    }
    const stats = { daysTracked, busiest, avgActive: daysTracked ? sum / daysTracked : 0, longest };

    return { cols, level, labels, stats };
  }, [totalsByIso]);

  return (
    <section className="panel stats-panel">
      <h2 className="section-title">Insights</h2>

      <div className="stats-top">
        {/* Week comparison */}
        <div className="week-compare">
          <div className="wc-head">
            <span className="wc-title">This week</span>
            <span className={`wc-delta ${week.delta > 0 ? "up" : week.delta < 0 ? "down" : ""}`}>
              {week.delta > 0 ? "▲" : week.delta < 0 ? "▼" : "•"} {Math.abs(Math.round(week.delta))}%
            </span>
          </div>
          <div className="wc-value">{whole(week.thisWeek)}</div>

          <div className="wc-bars">
            <div className="wc-row">
              <span className="wc-label">This</span>
              <div className="wc-track">
                <div
                  className="wc-fill now"
                  style={{ width: `${(week.thisWeek / week.max) * 100}%` }}
                />
              </div>
              <span className="wc-amt">{whole(week.thisWeek)}</span>
            </div>
            <div className="wc-row">
              <span className="wc-label">Last</span>
              <div className="wc-track">
                <div
                  className="wc-fill prev"
                  style={{ width: `${(week.lastWeek / week.max) * 100}%` }}
                />
              </div>
              <span className="wc-amt">{whole(week.lastWeek)}</span>
            </div>
          </div>
        </div>

        {/* Daily spend chart */}
        <div className="daily-chart">
          <div className="dc-title">
            Daily spend · {MONTHS_SHORT[month - 1]} {year}
          </div>
          <div className="dc-bars">
            {daily.rows.map((r) => (
              <div
                className="dc-col"
                key={r.day}
                title={`${MONTHS_SHORT[month - 1]} ${r.day}: ${whole(r.total)}${
                  r.total > daily.scaleMax ? " (above typical)" : ""
                }`}
              >
                <div
                  className={`dc-bar${r.total > daily.scaleMax ? " over" : ""}`}
                  style={{ height: `${barPct(r.total, daily.scaleMax)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="dc-axis">
            <span>1</span>
            <span>{Math.ceil(daily.rows.length / 2)}</span>
            <span>{daily.rows.length}</span>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="heatmap">
        <div className="hm-title">Spending activity · last 12 months</div>
        <div className="hm-body">
          <div className="hm-scroll">
            <div className="hm-labels">
              {heat.labels.map((l) => (
                <span
                  key={`${l.w}-${l.text}`}
                  className="hm-label"
                  style={{ left: `${(l.w / HEAT_WEEKS) * 100}%` }}
                >
                  {l.text}
                </span>
              ))}
            </div>
            <div className="hm-grid">
              {heat.cols.map((col, w) => (
                <div className="hm-col" key={w}>
                  {col.map((cell) => {
                    const lv = heat.level(cell.total);
                    return (
                      <div
                        key={cell.iso}
                        className="hm-cell"
                        style={{ background: lv < 0 ? "transparent" : HEAT_COLORS[lv] }}
                        title={lv < 0 ? "" : `${cell.iso}: ${whole(cell.total || 0)}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="hm-stats">
            <div className="hm-stat">
              <div className="hs-value">{heat.stats.daysTracked}</div>
              <div className="hs-label">days logged</div>
            </div>
            <div className="hm-stat">
              <div className="hs-value">{whole(heat.stats.busiest.total)}</div>
              <div className="hs-label">
                {heat.stats.busiest.iso ? `busiest · ${shortDate(heat.stats.busiest.iso)}` : "busiest day"}
              </div>
            </div>
            <div className="hm-stat">
              <div className="hs-value">{whole(heat.stats.avgActive)}</div>
              <div className="hs-label">avg / day</div>
            </div>
            <div className="hm-stat">
              <div className="hs-value">{heat.stats.longest}</div>
              <div className="hs-label">longest streak</div>
            </div>
          </div>
        </div>
        <div className="hm-legend">
          <span>Less</span>
          {HEAT_COLORS.map((c) => (
            <span key={c} className="hm-swatch" style={{ background: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </section>
  );
}
