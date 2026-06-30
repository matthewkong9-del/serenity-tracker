"use client";

import { useEffect, useRef } from "react";

interface PriceChartProps {
  ticker: string;
  sector?: string | null;
}

/**
 * Heuristic to guess the TradingView exchange prefix for non-US tickers.
 * TradingView handles US tickers without a prefix (e.g. "AAPL" just works).
 */
function tradingViewSymbol(ticker: string, sector?: string | null): string {
  const t = ticker.toUpperCase();

  // Taiwan: 4-digit numbers (e.g. 2330, 3231) or tickers ending in .TW/.TWO
  if (/^\d{4}$/.test(t) && sector?.includes("Taiwan")) return `TWSE:${t}`;
  if (/^\d{4}$/.test(t)) return `TWSE:${t}`; // heuristic: 4-digit numbers are Taiwan

  // Japan: 4-digit numbers in Japanese sector
  if (/^\d{4}$/.test(t) && sector?.includes("Japan")) return `TSE:${t}`;

  // Korea: 6-digit numbers
  if (/^\d{6}$/.test(t)) return `KRX:${t}`;

  // Hong Kong: 4-digit numbers with .HK suffix pattern
  if (sector?.includes("Hong Kong") && /^\d{4}/.test(t)) return `HKEX:${t}`;

  // Default: pass through as-is (US stocks and most international ones)
  return t;
}

export function PriceChart({ ticker, sector }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const symbol = tradingViewSymbol(ticker, sector);

  useEffect(() => {
    const container = containerRef.current;

    // Clean up any previous widget
    if (container) {
      container.innerHTML = "";
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      const tv = (window as any).TradingView;
      if (tv && container) {
        new tv.widget({
          container_id: container.id,
          symbol,
          interval: "D",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#141414",
          enable_publishing: false,
          hide_side_toolbar: true,
          allow_symbol_change: true,
          width: "100%",
          height: 380,
          details: false,
          hotlist: false,
          calendar: false,
          studies: [],
          hideideas: true,
        });
      }
    };

    if (container) {
      container.appendChild(script);
    }

    return () => {
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [symbol]);

  return (
    <div className="bg-surface border border-border rounded-xl p-5 h-full flex flex-col">
      <h2 className="text-xs text-muted uppercase tracking-wider font-semibold mb-4">
        📈 Price Chart
      </h2>

      <div className="flex-1 min-h-[340px]">
        <div
          id={`tv-chart-${ticker}`}
          ref={containerRef}
          className="w-full h-full rounded-lg overflow-hidden"
        />
      </div>

      <p className="text-muted/50 text-xs mt-3 text-right">
        {symbol !== ticker ? `${symbol}` : ""}
      </p>
    </div>
  );
}
