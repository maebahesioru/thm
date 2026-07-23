"use client";

import { useEffect, useState } from "react";

type Stats = {
  total: { programs: number; cm: number; durationSec: number; interruptions: number; uniqueVideos: number };
  today: { programs: number; cm: number; durationSec: number };
};

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  return `${m}分`;
}

export function StatsDashboard() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setS)
      .catch(() => {});
  }, []);

  if (!s) return <div className="text-sm text-neutral-500">読み込み中…</div>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card label="累計放送時間" value={fmtDuration(s.total.durationSec)} sub={`${s.total.programs}番組`} />
      <Card label="CM放送回数" value={String(s.total.cm)} sub={`${s.total.uniqueVideos}種類の動画`} />
      <Card label="割り込み回数" value={String(s.total.interruptions)} />
      <Card label="本日の放送" value={fmtDuration(s.today.durationSec)} sub={`${s.today.programs}番組 + CM${s.today.cm}`} />
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className="text-xl font-black text-red-400">{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-0.5">{sub}</div>}
    </div>
  );
}
