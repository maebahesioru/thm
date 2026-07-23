"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GuideProgram = {
  id: string;
  title: string;
  sourceType: string;
  sourceId: string;
  originUrl: string | null;
  author: string | null;
  thumbnailUrl: string | null;
  durationSec: number;
  startAt: string;
  endAt: string;
  band: string | null;
  tags: string[];
  kind: string;
  status: string;
};

const BAND_LABEL: Record<string, string> = {
  midnight: "深夜帯",
  morning: "朝",
  noon: "昼",
  evening: "夕方",
  golden: "ゴールデン",
  latenight: "深夜帯",
};

const BAND_COLOR: Record<string, string> = {
  midnight: "bg-purple-900/60 text-purple-200",
  morning: "bg-sky-900/60 text-sky-200",
  noon: "bg-amber-900/60 text-amber-200",
  evening: "bg-orange-900/60 text-orange-200",
  golden: "bg-yellow-800/60 text-yellow-100",
  latenight: "bg-purple-900/60 text-purple-200",
};

type Reservation = { programId: string; title: string; startAt: string };
const RES_KEY = "thm_reservations";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

export function GuideApp() {
  const [programs, setPrograms] = useState<GuideProgram[]>([]);
  const [nowId, setNowId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [detail, setDetail] = useState<GuideProgram | null>(null);
  const [search, setSearch] = useState("");
  const timers = useRef<number[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/guide?hours=24", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setPrograms(json.programs ?? []);
      setNowId(json.nowAiring?.id ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // 予約の読み込みと通知タイマー設定
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RES_KEY);
      const list: Reservation[] = raw ? JSON.parse(raw) : [];
      const valid = list.filter((r) => new Date(r.startAt).getTime() > Date.now() - 10 * 60 * 1000);
      setReservations(valid);
      localStorage.setItem(RES_KEY, JSON.stringify(valid));
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      timers.current.forEach(clearTimeout);
      timers.current = [];
      for (const r of valid) {
        const delay = new Date(r.startAt).getTime() - Date.now();
        if (delay > 0 && delay < 25 * 3600 * 1000 && "Notification" in window) {
          const id = window.setTimeout(() => {
            if (Notification.permission === "granted") {
              new Notification("テレビヒカマニ 録画予約", { body: `まもなく開始: ${r.title}` });
            }
          }, delay);
          timers.current.push(id);
        }
      }
    } catch {}
    return () => timers.current.forEach(clearTimeout);
  }, [programs]);

  const toggleReserve = (p: GuideProgram) => {
    const exists = reservations.some((r) => r.programId === p.id);
    const next = exists
      ? reservations.filter((r) => r.programId !== p.id)
      : [...reservations, { programId: p.id, title: p.title, startAt: p.startAt }];
    setReservations(next);
    localStorage.setItem(RES_KEY, JSON.stringify(next));
  };

  // 時間帯ごとにグルーピング (検索フィルタ適用)
  const groups = new Map<string, GuideProgram[]>();
  const q = search.trim().toLowerCase();
  const filtered = q
    ? programs.filter((p) => p.title.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)))
    : programs;
  for (const p of filtered) {
    const key = fmtDay(p.startAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  return (
    <div className="space-y-8">
      <NowPanel programs={programs} nowId={nowId} />

      {/* 検索フィルタ */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="番組タイトル・タグで検索…"
          className="w-full rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-2.5 text-sm outline-none focus:border-red-600 placeholder:text-neutral-500"
        />
        {search && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
            {filtered.length}件
          </span>
        )}
      </div>

      {programs.length === 0 && (
        <div className="text-neutral-400 text-sm border border-neutral-800 rounded-lg p-6 text-center">
          番組表を生成中です… (配信ワーカー `pnpm stream` を起動してください)
        </div>
      )}

      {[...groups.entries()].map(([day, list]) => (
        <section key={day}>
          <h2 className="text-lg font-bold mb-3 sticky top-14 bg-neutral-950/90 py-2 z-10">{day}</h2>
          <ol className="relative border-l border-neutral-800 ml-2 space-y-4">
            {list.map((p) => (
              <ProgramRow
                key={p.id}
                p={p}
                isNow={p.id === nowId}
                reserved={reservations.some((r) => r.programId === p.id)}
                onToggleReserve={() => toggleReserve(p)}
                onDetail={() => setDetail(p)}
              />
            ))}
          </ol>
        </section>
      ))}

      {/* 番組詳細ポップアップ */}
      {detail && <DetailModal p={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function NowPanel({ programs, nowId }: { programs: GuideProgram[]; nowId: string | null }) {
  const now = programs.find((p) => p.id === nowId);
  const idx = programs.findIndex((p) => p.id === nowId);
  const next = idx >= 0 ? programs[idx + 1] : undefined;
  if (!now) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="text-sm text-neutral-400">現在放送中の番組はありません</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-red-900/60 bg-gradient-to-br from-red-950/40 to-neutral-900 p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="onair-blink inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
        <span className="text-red-400 font-black tracking-widest text-sm">ON AIR</span>
        <span className="text-neutral-400 text-xs">
          {fmtTime(now.startAt)} - {fmtTime(now.endAt)}
        </span>
      </div>
      <div className="text-xl font-bold">{now.title}</div>
      <div className="text-sm text-neutral-400 mt-1 flex flex-wrap gap-2">
        {now.band && <Badge className={BAND_COLOR[now.band] ?? ""}>{BAND_LABEL[now.band] ?? now.band}</Badge>}
        {now.tags.map((t) => (
          <Badge key={t} className="bg-neutral-800 text-neutral-300">
            {t}
          </Badge>
        ))}
      </div>
      {next && (
        <div className="mt-3 text-sm text-neutral-400">
          次の番組: <span className="text-neutral-200">{fmtTime(next.startAt)}〜 {next.title}</span>
        </div>
      )}
      <a href="/watch" className="inline-block mt-4 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-bold">
        視聴する (開発プレビュー)
      </a>
    </div>
  );
}

function ProgramRow({
  p,
  isNow,
  reserved,
  onToggleReserve,
  onDetail,
}: {
  p: GuideProgram;
  isNow: boolean;
  reserved: boolean;
  onToggleReserve: () => void;
  onDetail: () => void;
}) {
  const isCm = p.kind === "cm";
  const isPast = new Date(p.endAt).getTime() < Date.now();
  const [pct, setPct] = useState(() => {
    if (!isNow) return 0;
    const total = new Date(p.endAt).getTime() - new Date(p.startAt).getTime();
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, ((Date.now() - new Date(p.startAt).getTime()) / total) * 100));
  });
  useEffect(() => {
    if (!isNow) return;
    const t = setInterval(() => {
      const total = new Date(p.endAt).getTime() - new Date(p.startAt).getTime();
      setPct(total > 0 ? Math.min(100, Math.max(0, ((Date.now() - new Date(p.startAt).getTime()) / total) * 100)) : 0);
    }, 1000);
    return () => clearInterval(t);
  }, [isNow, p.startAt, p.endAt]);

  return (
    <li className="ml-4 relative">
      <span
        className={`absolute -left-[1.35rem] top-5 w-3 h-3 rounded-full border-2 ${
          isNow ? "bg-red-500 border-red-300 onair-blink" : "bg-neutral-700 border-neutral-600"
        }`}
      />
      <div
        className={`relative rounded-xl border p-3 flex gap-3 ${
          isNow
            ? "border-red-800 bg-red-950/30"
            : isCm
              ? "border-neutral-800/70 bg-neutral-900/40"
              : "border-neutral-800 bg-neutral-900"
        } ${p.status === "done" || p.status === "skipped" || isPast ? "opacity-50" : ""}`}
      >
        {/* 現在時刻の赤ライン (プログレスバー) */}
        {isNow && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-neutral-800 rounded-b-xl overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <div className="w-16 shrink-0 text-center">
          <div className="font-mono font-bold text-sm">{fmtTime(p.startAt)}</div>
          <div className="text-[10px] text-neutral-500">{fmtTime(p.endAt)}</div>
          {isNow && <div className="text-[10px] text-red-400 font-bold mt-1">ON AIR</div>}
        </div>
        {p.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.thumbnailUrl} alt="" className="w-24 h-14 object-cover rounded-md shrink-0 hidden sm:block" />
        ) : (
          <div className="w-24 h-14 rounded-md bg-neutral-800 shrink-0 hidden sm:flex items-center justify-center text-[10px] text-neutral-500">
            NO IMAGE
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isCm && <Badge className="bg-neutral-700 text-neutral-200">CM</Badge>}
            {p.band && <Badge className={BAND_COLOR[p.band] ?? ""}>{BAND_LABEL[p.band] ?? p.band}</Badge>}
            <span className={`font-bold text-sm cursor-pointer hover:text-red-400 transition-colors ${isCm ? "text-neutral-400" : ""}`} onClick={onDetail}>{p.title}</span>
          </div>
          <div className="text-xs text-neutral-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {p.tags.map((t) => (
              <span key={t} className="text-neutral-400">
                #{t}
              </span>
            ))}
            {p.author && <span>投稿者: {p.author}</span>}
            {p.originUrl && (
              <a href={p.originUrl} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                元動画 ↗
              </a>
            )}
          </div>
        </div>
        <button
          onClick={onToggleReserve}
          className={`shrink-0 self-center px-3 py-1.5 rounded-lg text-xs font-bold border ${
            reserved
              ? "bg-yellow-500/20 border-yellow-600 text-yellow-300"
              : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
          }`}
          title="開始時刻にブラウザ通知でお知らせします"
        >
          {reserved ? "予約済み" : "録画予約"}
        </button>
      </div>
    </li>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${className ?? ""}`}>{children}</span>;
}

function DetailModal({ p, onClose }: { p: GuideProgram; onClose: () => void }) {
  const durMin = Math.floor(p.durationSec / 60);
  const durSec = p.durationSec % 60;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-white text-xl">&times;</button>
        {p.thumbnailUrl && (
          <img src={p.thumbnailUrl} alt="" className="w-full rounded-xl" />
        )}
        <h2 className="text-lg font-bold">{p.title}</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-neutral-800">{fmtTime(p.startAt)} 〜 {fmtTime(p.endAt)}</span>
          <span className="px-2 py-1 rounded bg-neutral-800">{durMin > 0 ? `${durMin}分${durSec > 0 ? `${durSec}秒` : ""}` : `${durSec}秒`}</span>
          {p.kind === "cm" && <span className="px-2 py-1 rounded bg-neutral-700">CM</span>}
          {p.band && <span className={`px-2 py-1 rounded font-bold ${BAND_COLOR[p.band] ?? ""}`}>{BAND_LABEL[p.band] ?? p.band}</span>}
        </div>
        {p.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.tags.map((t) => <span key={t} className="text-xs text-sky-400 bg-sky-950/50 px-1.5 py-0.5 rounded">#{t}</span>)}
          </div>
        )}
        {p.author && <div className="text-sm text-neutral-400">投稿者: {p.author}</div>}
        {p.originUrl && (
          <a href={p.originUrl} target="_blank" rel="noreferrer" className="inline-block px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-sm font-bold">
            元動画をニコニコで見る ↗
          </a>
        )}
        {p.sourceId && <div className="text-xs text-neutral-600">ID: {p.sourceId}</div>}
      </div>
    </div>
  );
}
