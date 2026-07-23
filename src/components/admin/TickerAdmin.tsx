"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Ticker = {
  id: string;
  text: string;
  kind: string;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
};

export function TickerAdmin({ initial }: { initial: Ticker[] }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"info" | "breaking">("info");
  const [ttlSec, setTtlSec] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    await fetch("/api/admin/ticker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim(), kind, ttlSec: ttlSec ? Number(ttlSec) : undefined }),
    });
    setText("");
    setTtlSec("");
    setBusy(false);
    router.refresh();
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/ticker?id=${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="テロップ本文 (例: ただいまHikakinTVで新着動画が公開されました)"
          className="flex-1 min-w-64 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-red-600"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "info" | "breaking")}
          className="rounded-lg bg-neutral-950 border border-neutral-700 px-2 py-2 text-sm"
        >
          <option value="info">情報</option>
          <option value="breaking">緊急速報</option>
        </select>
        <input
          value={ttlSec}
          onChange={(e) => setTtlSec(e.target.value)}
          placeholder="秒 (空=無期限)"
          className="w-28 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
          inputMode="numeric"
        />
        <button disabled={busy} className="rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-bold disabled:opacity-50">
          表示
        </button>
      </form>

      <ul className="divide-y divide-neutral-800 text-sm">
        {initial.length === 0 && <li className="py-2 text-neutral-500">テロップはありません</li>}
        {initial.map((t) => (
          <li key={t.id} className="py-2 flex items-center gap-2">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                t.kind === "breaking" ? "bg-red-700 text-white" : "bg-neutral-700 text-neutral-200"
              }`}
            >
              {t.kind === "breaking" ? "速報" : "情報"}
            </span>
            <span className={`flex-1 ${t.active ? "" : "line-through text-neutral-600"}`}>{t.text}</span>
            <span className="text-xs text-neutral-500">
              {t.expiresAt ? `${new Date(t.expiresAt).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" })}まで` : "無期限"}
            </span>
            {t.active && (
              <button onClick={() => remove(t.id)} className="text-xs text-neutral-400 hover:text-red-400">
                非表示
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
