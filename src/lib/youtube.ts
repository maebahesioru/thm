// YouTube: APIキー不要のチャンネル監視 (RSS + yt-dlp/Innertube/ページ解析)
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { config } from "./config";

const run = promisify(execFile);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type FeedEntry = {
  videoId: string;
  title: string;
  published: Date;
  channelId: string;
  channelTitle: string;
  durationSec?: number;
  thumbnailUrl?: string;
};

export type WatchInfo = {
  videoId: string;
  title: string;
  isLiveContent: boolean;
  isLiveNow: boolean;
  isUpcoming: boolean;
  premiereStartAt?: Date;
  durationSec?: number;
};

// @handle -> UC... チャンネルID解決
export async function resolveChannelId(handle: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/${handle}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/"externalId":"(UC[^"]+)"/) ??
      html.match(/channel\/(UC[\w-]{20,})/) ??
      html.match(/"channelId":"(UC[^"]+)"/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

// チャンネルのRSSフィード
export async function fetchFeed(channelId: string): Promise<FeedEntry[]> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`youtube feed ${res.status}`);
  const xml = await res.text();
  const entries: FeedEntry[] = [];
  const channelTitle = xml.match(/<title>([^<]*)<\/title>/)?.[1] ?? channelId;
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const e = m[1];
    const videoId = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = e.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    const published = e.match(/<published>([^<]+)<\/published>/)?.[1];
    if (videoId && published) {
      const durMatch = e.match(/<yt:duration[^>]*>(\d+)<\/yt:duration>/);
      const thumbMatch = e.match(/<media:thumbnail[^>]*url="([^"]+)"/);
      entries.push({
        videoId,
        title: decodeEntities(title),
        published: new Date(published),
        channelId,
        channelTitle: decodeEntities(channelTitle),
        durationSec: durMatch ? parseInt(durMatch[1], 10) : undefined,
        thumbnailUrl: thumbMatch?.[1] ?? undefined,
      });
    }
  }
  return entries;
}

// JSONの括弧対応を取りながら切り出す
function extractJson(text: string, startIdx: number): unknown | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(startIdx, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// watchページからライブ/プレミア情報を取得
// 本体: Innertube API (YouTubeの公開埋め込みキー。bot対策画面を回避するため)
// 予備: watchページのHTML解析
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

type PlayerResponse = {
  playabilityStatus?: { status?: string };
  videoDetails?: {
    title?: string;
    isLiveContent?: boolean;
    isLive?: boolean;
    isUpcoming?: boolean;
    lengthSeconds?: string;
  };
  liveBroadcastDetails?: { isLiveNow?: boolean; startTimestamp?: string; endTimestamp?: string };
};

function toWatchInfo(videoId: string, pr: PlayerResponse): WatchInfo | null {
  const vd = pr.videoDetails;
  if (!vd) return null;
  const lbd = pr.liveBroadcastDetails;
  const isLiveNow = !!lbd?.isLiveNow && !lbd?.endTimestamp;
  const isUpcoming = !!vd.isUpcoming || (!!lbd?.startTimestamp && new Date(lbd.startTimestamp) > new Date());
  return {
    videoId,
    title: vd.title ?? videoId,
    isLiveContent: !!vd.isLiveContent,
    isLiveNow,
    isUpcoming,
    premiereStartAt: lbd?.startTimestamp ? new Date(lbd.startTimestamp) : undefined,
    durationSec: vd.lengthSeconds ? Number(vd.lengthSeconds) : undefined,
  };
}

async function fetchViaInnertube(videoId: string): Promise<WatchInfo | null> {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20240726.00.00", hl: "ja", gl: "JP" } },
      videoId,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const pr = (await res.json()) as PlayerResponse;
  return toWatchInfo(videoId, pr);
}

async function fetchViaHtml(videoId: string): Promise<WatchInfo | null> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const idx = html.indexOf("ytInitialPlayerResponse");
  if (idx < 0) return null;
  const pr = (extractJson(html, html.indexOf("{", idx)) ?? null) as PlayerResponse | null;
  if (!pr) return null;
  return toWatchInfo(videoId, pr);
}

// yt-dlp経由 (bot対策回避実績が最も高い。YT_COOKIES対応)
async function fetchViaYtDlp(videoId: string): Promise<WatchInfo | null> {
  const args = [
    "--no-update", "--no-playlist", "--skip-download", "--dump-single-json",
    "--js-runtimes", "node", "--remote-components", "ejs:github",
  ];
  if (config.youtubeCookies && fs.existsSync(config.youtubeCookies)) {
    args.push("--cookies", config.youtubeCookies);
  }
  args.push(`https://www.youtube.com/watch?v=${videoId}`);
  const { stdout } = await run("yt-dlp", args, { maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
  const j = JSON.parse(stdout) as {
    title?: string;
    duration?: number;
    is_live?: boolean;
    was_live?: boolean;
    live_status?: string;
    release_timestamp?: number;
  } | null;
  if (!j || !j.title) return null;
  const isLiveNow = j.is_live === true || j.live_status === "is_live";
  const isUpcoming = j.live_status === "is_upcoming" || j.live_status === "was_upcoming";
  return {
    videoId,
    title: j.title,
    isLiveContent: isLiveNow || isUpcoming || j.was_live === true,
    isLiveNow,
    isUpcoming: isUpcoming && !!j.release_timestamp,
    premiereStartAt: j.release_timestamp ? new Date(j.release_timestamp * 1000) : undefined,
    durationSec: typeof j.duration === "number" ? j.duration : undefined,
  };
}

export async function fetchWatchInfo(videoId: string): Promise<WatchInfo | null> {
  try {
    const info = await fetchViaYtDlp(videoId);
    if (info) return info;
  } catch {}
  try {
    const info = await fetchViaInnertube(videoId);
    if (info) return info;
  } catch {}
  try {
    return await fetchViaHtml(videoId);
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function youtubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// 監視チャンネル全件のRSSから動画プールを取得
export async function fetchYoutubePool(channelHandles: Array<{ handle: string; label: string }>): Promise<FeedEntry[]> {
  const all: FeedEntry[] = [];
  for (const ch of channelHandles) {
    const id = await resolveChannelId(ch.handle);
    if (!id) continue;
    try {
      const feed = await fetchFeed(id);
      for (const e of feed) {
        e.channelTitle = e.channelTitle || ch.label;
      }
      all.push(...feed);
    } catch (e) {
      console.error(`[youtube] feed fetch failed for ${ch.label}:`, (e as Error).message);
    }
  }
  return all;
}
