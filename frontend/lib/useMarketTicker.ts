/**
 * KP Frontend — useMarketTicker hook
 *
 * Connects to the KP WebSocket at ws://localhost:8000/ws,
 * subscribes to the "market" channel, and delivers live NIFTY/BANKNIFTY ticks.
 *
 * Usage:
 *   const { indices, isOpen, connected, lastTick } = useMarketTicker();
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";

export interface IndexTick {
  ltp:        number | null;
  change:     number | null;
  change_pct: number | null;
  quality:    string;
  cache?:     string;
  fetched_at: string;
}

export interface MarketTick {
  indices: Record<string, IndexTick>;
  is_open: boolean;
  ts:      string;
}

export function useMarketTicker() {
  const [tick, setTick]         = useState<MarketTick | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastTick, setLastTick]   = useState<Date | null>(null);
  const wsRef                   = useRef<WebSocket | null>(null);
  const reconnectRef            = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Subscribe to market channel
      ws.send(JSON.stringify({ type: "subscribe", channels: ["market"] }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "tick" && msg.channel === "market") {
          setTick({
            indices: msg.indices ?? {},
            is_open: msg.is_open ?? false,
            ts:      msg.ts ?? new Date().toISOString(),
          });
          setLastTick(new Date());
        }
      } catch { /* ignore malformed frames */ }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 5s
      reconnectRef.current = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    indices:   tick?.indices ?? {},
    isOpen:    tick?.is_open ?? false,
    connected,
    lastTick,
    raw:       tick,
  };
}
