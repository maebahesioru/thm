"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = {
  engine: { state?: string; kind?: string; title?: string; offsetSec?: number; durationSec?: number };
  streamMode: string;
  hlsReady: boolean;
  nowAiring: { title: string; startAt: string; endAt: string } | null;
  next: { title: string; startAt: string } | null;
  ffmpeg?: { bitrate?: string; fps?: string; speed?: string };
  diskFree?: number;
};

function fmtBytes(b: number) {
  if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}

export function StatusPanel() {
  const [s, setS] = useState<Status | null>(null);
  const [skipping, setSkipping] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (res.ok && alive) setS(await res.json());
      } catch {}
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const engineState = s?.engine?.state ?? "stopped";
  const playing = engineState === "playing";

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <div className="text-xs text-neutral-500 mb-1">配信エンジン</div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${playing ? "bg-green-500" : "bg-neutral-600"}`} />
          <span className="font-bold">{playing ? "動作中" : "停止"}</span>
        </div>
        <div className="text-xs text-neutral-500">mode: {s?.streamMode ?? "-"}</div>
        {playing && (
          <button
            disabled={skipping}
            onClick={async () => {
              setSkipping(true);
              await fetch("/api/admin/skip", { method: "POST" });
              setSkipping(false);
              router.refresh();
            }}
            className="mt-2 text-xs px-3 py-1 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white font-bold disabled:opacity-50 transition-colors"
          >
            ⏭ スキップ
          </button>
        )}
        {playing && s?.engine?.title && (
          <div className="text-sm text-neutral-300 mt-1 truncate max-w-48" title={s.engine.title}>
            {s.engine.kind}: {s.engine.title}
          </div>
        )}
      </div>
      <div>
        <div className="text-xs text-neutral-500 mb-1">番組</div>
        <div className="text-sm truncate">
          ON: <span className="font-bold">{s?.nowAiring?.title ?? "なし"}</span>
        </div>
        <div className="text-sm text-neutral-400 truncate">次: {s?.next?.title ?? "なし"}</div>
        <div className="text-xs text-neutral-500 mt-1">HLS: {s?.hlsReady ? "OK" : "未生成"}</div>
      </div>
      <div>
        <div className="text-xs text-neutral-500 mb-1">ffmpeg</div>
        {s?.ffmpeg?.bitrate ? (
          <div className="text-sm space-y-0.5">
            <div>bitrate: <span className="font-mono">{s.ffmpeg.bitrate}</span></div>
            <div>fps: <span className="font-mono">{s.ffmpeg.fps}</span></div>
            <div>speed: <span className="font-mono">{s.ffmpeg.speed}</span></div>
          </div>
        ) : (
          <div className="text-sm text-neutral-500">-</div>
        )}
      </div>
      <div>
        <div className="text-xs text-neutral-500 mb-1">ディスク</div>
        <div className="text-sm">
          空き: <span className="font-mono font-bold">{s?.diskFree ? fmtBytes(s.diskFree) : "-"}</span>
        </div>
      </div>
    </div>
  );
}
