"use client";

/**
 * KP — TechnicalChart
 *
 * Renders OHLCV price + RSI(14) + MACD(12,26,9) in 3 panes using recharts.
 * Data from GET /api/v1/features/{symbol}?lookback=N — real computed values only.
 *
 * Pane layout:
 *   [60%] Price (line) + SMA20 + EMA12
 *   [20%] MACD histogram + line + signal
 *   [20%] RSI(14) with 30/50/70 bands
 */
import {
  ComposedChart, AreaChart, LineChart,
  Area, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
  Legend,
} from "recharts";
import { useMemo } from "react";

export interface FeatureRow {
  date:        string;
  open?:       number | null;
  high?:       number | null;
  low?:        number | null;
  close:       number;
  volume?:     number | null;
  sma_20?:     number | null;
  ema_12?:     number | null;
  rsi_14?:     number | null;
  macd_line?:  number | null;
  macd_signal?:number | null;
  macd_hist?:  number | null;
}

interface Props {
  data: FeatureRow[];
  symbol: string;
  height?: number;
}

const COLORS = {
  price:   "#6366f1",
  sma:     "#f59e0b",
  ema:     "#34d399",
  macdLine:"#6366f1",
  signal:  "#f59e0b",
  histUp:  "#22c55e",
  histDn:  "#ef4444",
  rsi:     "#a78bfa",
  grid:    "rgba(255,255,255,0.05)",
  tooltip: "#1e293b",
};

function fmtDate(d: string) {
  return d?.slice(5);   // "MM-DD"
}

function fmtPrice(v: number) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`;
}

// Tooltip shared style
const ttStyle: React.CSSProperties = {
  background: "var(--surface-02)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: "0.75rem",
  color: "var(--text-primary)",
};

function PriceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as FeatureRow;
  return (
    <div style={ttStyle}>
      <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)",
        fontWeight: 600, color: "var(--text-secondary)" }}>{d.date}</div>
      <div style={{ padding: "6px 10px", display: "grid", gap: 3 }}>
        {[
          ["Close", d.close,   "#fff"],
          ["SMA20", d.sma_20,  COLORS.sma],
          ["EMA12", d.ema_12,  COLORS.ema],
        ].map(([k, v, c]) => v != null && (
          <div key={k as string} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "var(--text-tertiary)" }}>{k}</span>
            <span style={{ color: c as string, fontFamily: "var(--font-mono)" }}>
              {fmtPrice(v as number)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MACDTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as FeatureRow;
  return (
    <div style={ttStyle}>
      <div style={{ padding: "6px 10px", display: "grid", gap: 3 }}>
        {[
          ["MACD",   d.macd_line,   COLORS.macdLine],
          ["Signal", d.macd_signal, COLORS.signal],
          ["Hist",   d.macd_hist,   d.macd_hist != null && d.macd_hist >= 0 ? COLORS.histUp : COLORS.histDn],
        ].map(([k, v, c]) => v != null && (
          <div key={k as string} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "var(--text-tertiary)" }}>{k}</span>
            <span style={{ color: c as string, fontFamily: "var(--font-mono)" }}>
              {(v as number).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RSITooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as FeatureRow;
  if (d.rsi_14 == null) return null;
  const rsi = d.rsi_14;
  const zone = rsi >= 70 ? "Overbought" : rsi <= 30 ? "Oversold" : "Neutral";
  const color = rsi >= 70 ? COLORS.histDn : rsi <= 30 ? COLORS.histUp : COLORS.rsi;
  return (
    <div style={ttStyle}>
      <div style={{ padding: "6px 10px", display: "grid", gap: 3 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: "var(--text-tertiary)" }}>RSI(14)</span>
          <span style={{ color, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
            {rsi.toFixed(1)}
          </span>
        </div>
        <div style={{ color: "var(--text-tertiary)", fontSize: "0.714rem" }}>{zone}</div>
      </div>
    </div>
  );
}

export default function TechnicalChart({ data, symbol, height = 480 }: Props) {
  // Colour MACD histogram bars individually
  const chartData = useMemo(() =>
    data.map(row => ({
      ...row,
      macd_hist_pos: row.macd_hist != null && row.macd_hist >= 0 ? row.macd_hist : null,
      macd_hist_neg: row.macd_hist != null && row.macd_hist  < 0 ? row.macd_hist : null,
    })),
    [data]
  );

  if (!data.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-tertiary)", fontSize: "0.857rem" }}>
        No feature data — run: <code style={{ margin: "0 6px", color: "var(--accent-bright)" }}>
          python scripts/ingest_ohlcv.py --symbol {symbol} --period 1y
        </code>
      </div>
    );
  }

  const paneH = {
    price:  Math.round(height * 0.58),
    macd:   Math.round(height * 0.22),
    rsi:    Math.round(height * 0.20),
  };

  const axisStyle = { fill: "var(--text-tertiary)", fontSize: 10 };

  return (
    <div style={{ width: "100%" }}>

      {/* ── Price + MA ─────────────────────────────────────── */}
      <div style={{ marginBottom: 2 }}>
        <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)",
          marginBottom: 4, display: "flex", gap: 16 }}>
          <span style={{ color: COLORS.price }}>● Close</span>
          <span style={{ color: COLORS.sma }}>● SMA20</span>
          <span style={{ color: COLORS.ema }}>● EMA12</span>
        </div>
        <ResponsiveContainer width="100%" height={paneH.price}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={axisStyle}
              interval={Math.floor(chartData.length / 6)} />
            <YAxis tickFormatter={v => `${(v/1000).toFixed(1)}k`}
              tick={axisStyle} width={44} domain={["auto","auto"]} />
            <Tooltip content={<PriceTooltip />} />
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={COLORS.price} stopOpacity={0.2} />
                <stop offset="95%" stopColor={COLORS.price} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="close" stroke={COLORS.price}
              strokeWidth={1.5} fill="url(#priceGrad)" dot={false} />
            <Line type="monotone" dataKey="sma_20" stroke={COLORS.sma}
              strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls />
            <Line type="monotone" dataKey="ema_12" stroke={COLORS.ema}
              strokeWidth={1} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── MACD ───────────────────────────────────────────── */}
      <div style={{ marginBottom: 2 }}>
        <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)",
          marginBottom: 4, display: "flex", gap: 16 }}>
          <span style={{ color: COLORS.macdLine }}>● MACD</span>
          <span style={{ color: COLORS.signal }}>● Signal</span>
          <span style={{ color: COLORS.histUp }}>▮ Hist+</span>
          <span style={{ color: COLORS.histDn }}>▮ Hist−</span>
        </div>
        <ResponsiveContainer width="100%" height={paneH.macd}>
          <ComposedChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={axisStyle}
              interval={Math.floor(chartData.length / 6)} />
            <YAxis tick={axisStyle} width={44} domain={["auto","auto"]} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
            <Tooltip content={<MACDTooltip />} />
            <Bar dataKey="macd_hist_pos" fill={COLORS.histUp} maxBarSize={3} />
            <Bar dataKey="macd_hist_neg" fill={COLORS.histDn} maxBarSize={3} />
            <Line type="monotone" dataKey="macd_line" stroke={COLORS.macdLine}
              strokeWidth={1.5} dot={false} connectNulls />
            <Line type="monotone" dataKey="macd_signal" stroke={COLORS.signal}
              strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── RSI ────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)",
          marginBottom: 4, display: "flex", gap: 16 }}>
          <span style={{ color: COLORS.rsi }}>● RSI(14)</span>
          <span style={{ color: COLORS.histDn, opacity: 0.7 }}>— 70 OB</span>
          <span style={{ color: COLORS.histUp, opacity: 0.7 }}>— 30 OS</span>
        </div>
        <ResponsiveContainer width="100%" height={paneH.rsi}>
          <ComposedChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={axisStyle}
              interval={Math.floor(chartData.length / 6)} />
            <YAxis tick={axisStyle} width={44} domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} />
            <ReferenceLine y={70} stroke={COLORS.histDn} strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={50} stroke="rgba(255,255,255,0.1)" strokeDasharray="2 2" />
            <ReferenceLine y={30} stroke={COLORS.histUp} strokeDasharray="3 3" strokeOpacity={0.5} />
            <Tooltip content={<RSITooltip />} />
            <Line type="monotone" dataKey="rsi_14" stroke={COLORS.rsi}
              strokeWidth={1.5} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
