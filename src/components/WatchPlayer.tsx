"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

export function WatchPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("配信に接続中…");
  const [live, setLive] = useState(false);
  const [muted, setMuted] = useState(true);
  const [userUnmuted, setUserUnmuted] = useState(false);

  // ユーザー操作でミュート解除
  const unmute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    setUserUnmuted(true);
    video.play().catch(() => {});
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const src = "/api/stream/index.m3u8";
    let hls: Hls | null = null;

    // 停止・右クリック防止
    const forcePlay = () => { if (video.paused) video.play().catch(() => {}); };
    video.addEventListener("pause", forcePlay);
    video.addEventListener("ended", forcePlay);
    video.addEventListener("contextmenu", (e) => e.preventDefault());

    if (Hls.isSupported()) {
      hls = new Hls({
        liveSyncDurationCount: 3,
        maxLiveSyncPlaybackRate: 1.0,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        // セグメント欠損時の許容範囲を広げる
        maxBufferSize: 60 * 1000 * 1000,
        maxBufferHole: 2,
        highBufferWatchdogPeriod: 3,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLive(true);
        setStatus("配信中");
        // 自動再生 (ユーザー操作前は muted のまま、クリック待ち)
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setLive(false);
          setStatus("再接続中…");
          setTimeout(() => {
            if (hls) {
              hls.destroy();
              hls = new Hls({
                liveSyncDurationCount: 3,
                maxLiveSyncPlaybackRate: 1.0,
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
                maxBufferSize: 60 * 1000 * 1000,
                maxBufferHole: 2,
                highBufferWatchdogPeriod: 3,
              });
              hls.loadSource(src);
              hls.attachMedia(video);
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                setLive(true);
                setStatus("配信中");
                if (!video.muted || userUnmuted) video.muted = false;
                video.play().catch(() => {});
              });
              hls.on(Hls.Events.ERROR, (_e2, d2) => {
                if (d2.fatal) setStatus("配信が停止しています");
              });
            }
          }, 3000);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      setLive(true);
      setStatus("配信中");
    } else {
      setStatus("お使いのブラウザはHLSに対応していません");
    }

    return () => {
      video.removeEventListener("pause", forcePlay);
      video.removeEventListener("ended", forcePlay);
      hls?.destroy();
    };
  }, [userUnmuted]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl border border-neutral-800 overflow-hidden group">
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        className="absolute inset-0 w-full h-full object-contain cursor-pointer"
        onClick={unmute}
      />
      {/* LIVE インジケータ */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 rounded-full px-3 py-1 z-10">
        <span className={`w-2 h-2 rounded-full ${live ? "bg-red-500 onair-blink" : "bg-neutral-500"}`} />
        <span className="text-xs font-black tracking-wider text-white">
          {live ? "LIVE" : "OFF AIR"}
        </span>
      </div>
      {/* 音声オフ時のクリック誘導オーバーレイ */}
      {live && muted && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 cursor-pointer z-20"
          onClick={unmute}
        >
          <div className="bg-red-600 hover:bg-red-500 rounded-full px-6 py-3 text-white font-bold text-sm shadow-lg transition-colors">
            ▶ クリックして音声をオン
          </div>
          <div className="text-neutral-300 text-xs mt-2">
            ブラウザの自動再生制限のため、クリックが必要です
          </div>
        </div>
      )}
      {/* ステータス表示 (配信未接続時) */}
      {!live && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
          <span className="text-neutral-300 text-sm font-bold">{status}</span>
        </div>
      )}
    </div>
  );
}
