"use client";

import { useEffect, useState } from "react";

interface ComponentStatus {
  status: "online" | "offline" | "degraded" | "unknown";
  latency_ms?: number;
  detail?: string;
}

interface SystemStatusData {
  components?: {
    database?: ComponentStatus;
    redis?: ComponentStatus;
    market_feed?: ComponentStatus & { provider?: string };
    ml_engine?: ComponentStatus;
  };
  timestamp?: number;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
const POLL_INTERVAL_MS = 30_000;

function StatusDot({ status }: { status: string }) {
  return <span className={`status-dot ${status}`} aria-hidden />;
}

function ComponentRow({
  label,
  data,
}: {
  label: string;
  data?: ComponentStatus & { provider?: string };
}) {
  const status = data?.status ?? "unknown";
  const latency = data?.latency_ms;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 0",
      borderBottom: "1px solid var(--border-subtle)",
    }}>
      <StatusDot status={status} />
      <span style={{ flex: 1, fontSize: "0.786rem", color: "var(--text-secondary)" }}>
        {label}
      </span>
      {latency != null && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
          {latency}ms
        </span>
      )}
      <span style={{
        fontSize: "0.643rem",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: status === "online"
          ? "var(--color-up)"
          : status === "offline"
          ? "var(--color-down)"
          : status === "degraded"
          ? "var(--color-warn)"
          : "var(--text-tertiary)",
      }}>
        {status === "not_configured" ? "N/A" : status}
      </span>
    </div>
  );
}

export function SystemStatus({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/system/status`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastCheck(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unreachable");
      setLastCheck(new Date());
    }
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Compact mode: just show overall dot in header
  if (compact) {
    const allOnline =
      data?.components?.database?.status === "online" &&
      data?.components?.redis?.status === "online";
    const anyOffline =
      data?.components?.database?.status === "offline" ||
      data?.components?.redis?.status === "offline";
    const overallStatus = error || !data
      ? "unknown"
      : anyOffline
      ? "offline"
      : allOnline
      ? "online"
      : "degraded";

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          borderRadius: "var(--border-radius)",
          background: "var(--surface-02)",
          border: "1px solid var(--border-subtle)",
          fontSize: "0.714rem",
          color: "var(--text-tertiary)",
          cursor: "default",
        }}
        title={error ? `Backend unreachable: ${error}` : `System status: ${overallStatus}`}
        aria-label={`System status: ${overallStatus}`}
      >
        <StatusDot status={overallStatus} />
        <span style={{ color: "var(--text-secondary)" }}>
          {error ? "Backend offline" : overallStatus === "online" ? "Systems OK" : "Partial"}
        </span>
      </div>
    );
  }

  // Full status panel
  return (
    <div className="card" style={{ minWidth: 280 }}>
      <div className="card-header">
        <span className="card-title">System Status</span>
        <span className="card-action" onClick={fetchStatus} title="Refresh">
          ↻ Refresh
        </span>
      </div>

      {error && (
        <div style={{
          padding: "8px 10px",
          background: "var(--color-down-dim)",
          borderRadius: "var(--border-radius-sm)",
          fontSize: "0.786rem",
          color: "var(--color-down)",
          marginBottom: 10,
        }}>
          Backend unreachable: {error}
        </div>
      )}

      <ComponentRow label="PostgreSQL" data={data?.components?.database} />
      <ComponentRow label="Redis"      data={data?.components?.redis} />
      <ComponentRow label="Market Feed" data={data?.components?.market_feed} />
      <ComponentRow label="ML Engine"  data={data?.components?.ml_engine} />

      {lastCheck && (
        <div style={{
          paddingTop: 8,
          fontSize: "0.643rem",
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
        }}>
          Last checked: {lastCheck.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST
        </div>
      )}
    </div>
  );
}
