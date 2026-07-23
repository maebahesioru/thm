// YouTubeチャンネルから全動画リストを取得 (yt-dlp経由、キャッシュ付き)
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { CACHE_DIR, config } from "./config";

const run = promisify(execFile);

export type YtVideo = {
  id: string;
  title: string;
  durationSec: number;
  channelTitle?: string;
};

// チャンネルの全動画を一括取得 (yt-dlp --flat-playlist)
export async function fetchChannelVideos(handle: string, label: string): Promise<YtVideo[]> {
  const cacheKey = `yt_channel_${handle.replace(/[/@]/g, "_")}.json`;
  const cachePath = path.join(CACHE_DIR, cacheKey);
  const cacheAge = 60 * 60 * 1000; // 1時間キャッシュ

  // キャッシュがあれば使う
  try {
    const stat = fs.statSync(cachePath);
    if (Date.now() - stat.mtimeMs < cacheAge) {
      return JSON.parse(fs.readFileSync(cachePath, "utf-8")) as YtVideo[];
    }
  } catch {}

  const url = `https://www.youtube.com/${handle}/videos`;
  try {
    const args = [
      "--no-update", "--no-playlist", "--flat-playlist",
      "--dump-json", "--playlist-end", "200",
    ];
    // cookies
    if (config.youtubeCookies && fs.existsSync(config.youtubeCookies)) {
      args.push("--cookies", config.youtubeCookies);
    }
    args.push("--js-runtimes", "node", "--remote-components", "ejs:github");
    args.push(url);

    const { stdout } = await run("yt-dlp", args, { maxBuffer: 32 * 1024 * 1024, timeout: 5 * 60 * 1000 });
    const videos: YtVideo[] = [];
    for (const line of stdout.trim().split("\n")) {
      if (!line) continue;
      try {
        const j = JSON.parse(line) as { id?: string; title?: string; duration?: number; channel?: string };
        if (j.id && j.title) {
          videos.push({
            id: j.id,
            title: j.title,
            durationSec: typeof j.duration === "number" ? j.duration : 600,
            channelTitle: j.channel || label,
          });
        }
      } catch {}
    }

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(videos), "utf-8");
    console.log(`[youtube] ${label}: ${videos.length} videos cached`);
    return videos;
  } catch (e) {
    console.error(`[youtube] channel fetch failed for ${label}:`, (e as Error).message?.slice(0, 200));
    // キャッシュがあればそれを使う
    try {
      return JSON.parse(fs.readFileSync(cachePath, "utf-8")) as YtVideo[];
    } catch {
      return [];
    }
  }
}

// 全監視チャンネルから動画プールを取得
let fullPoolCache: { videos: YtVideo[]; fetchedAt: number } | null = null;

export async function getFullYoutubePool(
  channels: Array<{ handle: string; label: string }>,
): Promise<YtVideo[]> {
  if (fullPoolCache && Date.now() - fullPoolCache.fetchedAt < 30 * 60 * 1000) {
    return fullPoolCache.videos;
  }
  const all: YtVideo[] = [];
  for (const ch of channels) {
    const vids = await fetchChannelVideos(ch.handle, ch.label);
    for (const v of vids) if (!v.channelTitle) v.channelTitle = ch.label;
    all.push(...vids);
  }
  fullPoolCache = { videos: all, fetchedAt: Date.now() };
  console.log(`[youtube] full pool: ${all.length} videos from ${channels.length} channels`);
  return all;
}
