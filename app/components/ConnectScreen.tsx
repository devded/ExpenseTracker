"use client";

import { useState } from "react";

export default function ConnectScreen({
  onConnected,
}: {
  onConnected: (workspace: string) => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not connect.");
        return;
      }
      setOk(
        data.created
          ? `Created the ExpenseTracker database in ${data.workspace}.`
          : data.addedProperties?.length
            ? `Found ExpenseTracker and added: ${data.addedProperties.join(", ")}.`
            : `Connected to ${data.workspace}.`,
      );
      // Brief pause so the success note is visible before the dashboard loads.
      setTimeout(() => onConnected(data.workspace), 700);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="connect-wrap">
      <div className="connect-card">
        <div className="glyph">₤</div>
        <h1>Connect your Notion</h1>
        <p className="lede">
          Ledger stores every expense in a database inside your own Notion workspace. Paste an
          integration token and we&apos;ll find your <strong>ExpenseTracker</strong> database — or
          create it for you with the right columns.
        </p>

        <ol className="steps">
          <li>
            Open{" "}
            <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer">
              notion.so/my-integrations
            </a>{" "}
            and create an internal integration.
          </li>
          <li>Copy its “Internal Integration Secret”.</li>
          <li>
            Open any Notion page → “···” menu → <strong>Connections</strong> → add your integration
            (so we have somewhere to create the database).
          </li>
          <li>Paste the secret below.</li>
        </ol>

        {error && <div className="notice error">{error}</div>}
        {ok && <div className="notice ok">{ok}</div>}

        <form onSubmit={connect}>
          <div className="field">
            <label htmlFor="token">Integration token</label>
            <input
              id="token"
              type="password"
              autoComplete="off"
              placeholder="ntn_… or secret_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <button className="btn" type="submit" disabled={busy || !token.trim()}>
            {busy ? "Connecting…" : "Connect & set up database"}
          </button>
        </form>
      </div>
    </div>
  );
}
