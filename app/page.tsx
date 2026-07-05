"use client";

import { useEffect, useState } from "react";
import ConnectScreen from "./components/ConnectScreen";
import Dashboard from "./components/Dashboard";

type State =
  | { phase: "loading" }
  | { phase: "disconnected" }
  | { phase: "connected"; workspace: string };

export default function Home() {
  const [state, setState] = useState<State>({ phase: "loading" });

  async function refreshStatus() {
    try {
      const res = await fetch("/api/notion/status");
      const data = await res.json();
      if (data.connected) {
        setState({ phase: "connected", workspace: data.workspace || "Notion workspace" });
      } else {
        setState({ phase: "disconnected" });
      }
    } catch {
      setState({ phase: "disconnected" });
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function disconnect() {
    await fetch("/api/notion/disconnect", { method: "POST" });
    setState({ phase: "disconnected" });
  }

  if (state.phase === "loading") {
    return (
      <div className="center-screen">
        <span className="spinner" />
        Checking connection…
      </div>
    );
  }

  if (state.phase === "disconnected") {
    return (
      <ConnectScreen
        onConnected={(workspace) => setState({ phase: "connected", workspace })}
      />
    );
  }

  return <Dashboard workspace={state.workspace} onDisconnect={disconnect} />;
}
