"use client";

import { useEffect, useState } from "react";

type Entry = {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string | null;
  playedAt: string;
};

export function HistoryLog() {
  const [list, setList] = useState<Entry[]>([]);

  useEffect(() => {
    fetch("/api/admin/history?limit=100")
      .then((r) => r.json())
      .then((j) => setList(j.history ?? []))
      .catch(() => {});
  }, []);

  if (list.length === 0) {
    return <div className="text-sm text-neutral-500 py-2">放送履歴はまだありません</div>;
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <ul className="divide-y divide-neutral-800 text-sm max-h-96 overflow-y-auto">
        {list.map((h) => (
          <li key={h.id} className="py-2 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-neutral-500 w-24 shrink-0">
              {new Date(h.playedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-neutral-700 text-neutral-200 shrink-0">
              {h.sourceType === "niconico-cm" ? "CM" : h.sourceType}
            </span>
            <span className="flex-1 min-w-48 truncate" title={h.title ?? ""}>{h.title ?? h.sourceId}</span>
            <span className="text-xs text-neutral-600 font-mono">{h.sourceId}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
