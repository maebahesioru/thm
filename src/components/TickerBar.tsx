"use client";

import { useEffect, useState } from "react";

type Ticker = { id: string; text: string; kind: "info" | "breaking" };

export function TickerBar() {
  const [tickers, setTickers] = useState<Ticker[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (alive) setTickers(json.tickers ?? []);
      } catch {}
    };
    load();
    const t = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (tickers.length === 0) return null;

  const breaking = tickers.find((t) => t.kind === "breaking");
  const text = breaking ? breaking.text : tickers.map((t) => t.text).join("　◇　");

  return (
    <div
      className={`overflow-hidden border-t border-neutral-800 ${
        breaking ? "bg-red-700 text-white" : "bg-neutral-900 text-neutral-200"
      }`}
    >
      <div className="ticker-scroll py-1 text-sm font-bold">{text}</div>
    </div>
  );
}
