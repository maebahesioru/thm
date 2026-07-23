import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { getActiveTickers } from "@/lib/ticker";
import { getNowAndNext } from "@/lib/scheduler";
import { HLS_DIR, OVERLAY_DIR, DATA_DIR, config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const [tickers, { nowAiring, next }, engineSetting] = await Promise.all([
    getActiveTickers(),
    getNowAndNext(),
    prisma.setting.findUnique({ where: { key: "engineState" } }),
  ]);

  let engine: unknown = { state: "stopped" };
  try {
    engine = engineSetting ? JSON.parse(engineSetting.value) : engine;
  } catch {}

  // ffmpeg統計
  let ffmpegStats: Record<string, string> = {};
  try {
    const statsPath = path.join(OVERLAY_DIR, "ffstats.json");
    if (fs.existsSync(statsPath)) {
      ffmpegStats = JSON.parse(fs.readFileSync(statsPath, "utf-8"));
    }
  } catch {}

  // ディスク容量
  let diskFree = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (fs as any).statfsSync(DATA_DIR);
    diskFree = Number(s.bfree) * Number(s.bsize);
  } catch {}

  return NextResponse.json({
    tickers: tickers.map((t) => ({ id: t.id, text: t.text, kind: t.kind })),
    engine,
    streamMode: config.streamMode,
    hlsReady: fs.existsSync(path.join(HLS_DIR, "index.m3u8")),
    ffmpeg: ffmpegStats,
    diskFree,
    nowAiring: nowAiring
      ? {
          id: nowAiring.id,
          title: nowAiring.title,
          kind: nowAiring.kind,
          startAt: nowAiring.startAt.toISOString(),
          endAt: nowAiring.endAt.toISOString(),
          originUrl: nowAiring.originUrl,
          thumbnailUrl: nowAiring.thumbnailUrl,
        }
      : null,
    next: next
      ? { id: next.id, title: next.title, startAt: next.startAt.toISOString(), endAt: next.endAt.toISOString() }
      : null,
  });
}
